# Paw floor-projection trust layer

Status: approved design, not yet implemented
Date: 2026-07-31
Repo: `session-viewer` (analysis findings concern `unity-game`'s recorder)

## Why

`paw_floor_projection_raycasting_v1` is the first inference CSV the viewer would read.
It is worth reading, but only if the viewer is honest about what it contains. Two facts
drive the whole design:

1. **`paw_depth_m` is structurally empty.** It is 0-populated across all 7 183 rows of the
   six sessions measured. `PawFloorRaycastCaptureSource.cs:93` sources it from
   `pawKeypoint.depthM`, which Apple's Vision animal-pose request never sets, so the
   `float?` always serialises to `""`.
2. **The raycast carries no vertical information at all.** `world_y` is exactly the AR
   plane's height — checked against `BoardPlaced.boardOrigin[1]`, the delta is `+0.0000 m`
   in every session. This is by construction: `hit.pose.position` on a `HorizontalUp`
   plane. What is stored is a 2D floor position.

So the file is a floor-projection tracker, not a depth sensor — which is what its model id
already says. The viewer's job is to show that projection *and the conditions under which
it stops being true*.

## Measured baseline

Six sessions, `20260731-01*`, one device, one dog.

| session | rows | hits | plane y-span | depression p5 / p50 | stance residual | baseline |
|---|---|---|---|---|---|---|
| `…-3a89` | 821 | 98.5% | 0.0 cm | 42.2° / 60.5° | 7.9 cm | loose |
| `…-dd26` | 1 715 | 98.8% | 3.6 cm | 36.3° / 53.4° | 8.5 cm | loose |
| `…-8410` | 588 | 100.0% | 0.0 cm | 58.8° / 70.9° | 0.4 cm | stable |
| `…-eec1` | 1 417 | 89.8% | 1.8 cm | 52.8° / 65.9° | 1.2 cm | stable |
| `…-ec14` | 1 317 | 98.0% | 3.4 cm | 51.2° / 64.2° | 0.9 cm | stable |
| `…-c1d4` | 1 325 | 95.9% | 3.1 cm | 53.0° / 65.4° | 1.5 cm | mixed |
| **total** | **7 183** | **96.4%** | | | | |

Supporting measurements:

- **Join quality**: `frame_id` matches `sensors.csv.gz` on 2 727 / 2 728 frames. Camera
  pose is available for essentially every sample, so ray geometry is always computable.
- **Cadence**: 17–34 ms median between samples.
- **Conditioning**: 0.12 cm of floor displacement per camera pixel at p50, 0.35 cm at p99.
  At these depression angles the projection is geometrically tight — landmark pixel noise
  buys sub-centimetre floor error.
- **Stance stability**: `|left_front − right_front|` holds at 0.16–0.18 m with ±0.01 m
  p5–p95 spread in the static sessions.
- **Coverage gaps**: `right_back_paw` draws 29–89 samples against ~400 for the others in
  four of six sessions. Only 8–30% of timestamps carry all four paws.
- **Plane instability**: `dd26` raycast against two planes disagreeing by 9 cm
  (`-1.259` vs `-1.355`). Every hit inherits that as bias.

### The failure the schema cannot see

A lifted paw's ray keeps travelling until it meets the floor, so the recorded point is
pushed *away from the camera* by `lift / tan(depression)`:

| lift | at 27° | at 40° | at 60° | at 70° |
|---|---|---|---|---|
| 5 cm | 9.8 cm | 6.0 cm | 2.9 cm | 1.8 cm |
| 10 cm | 19.6 cm | 11.9 cm | 5.8 cm | 3.6 cm |
| 20 cm | 39.3 cm | 23.8 cm | 11.5 cm | 7.3 cm |

Nothing in the row distinguishes a planted paw from a lifted one.

### Why we do not simply estimate the lift

A stance-geometry solver was prototyped before committing to this design. It assumes the
four paws hold near-constant pairwise distances, then attributes deviation to a single
lifted paw. **It is degenerate exactly where it is needed.**

On the static sessions the baseline is tight (relative IQR 0.02–0.10) and the solver
recovers plausible 2–5 cm lifts. On the moving sessions the baseline is loose (relative
IQR 0.30–0.80, one pair at 5.16) and the fitted lifts pin against the 40 cm search
ceiling — in `dd26` all four paws are assigned 21–26 cm "lifts", which is nonsense for a
standing dog. The solver absorbs gait into the lift parameter. A rigid stance is precisely
the case with no lift worth measuring.

What survives is the **residual itself**: 0.4–1.5 cm when the projections agree versus
7.9–8.5 cm when they do not, a clean ~6× separation, computed per frame with no claim
about height. That is the trust signal.

### Not ground truth

`DogEnteredCell.worldPosition` looks like a validation target but is not one:
`GameLoopV2.cs:1680` assigns `worldPos = activeCell.WorldPosition`, the cell centre from a
dev-triggered path. These bundles contain no independent ground truth for paw position.

## Design

### 1. Ingest

- `detectCSVType` gains `'pawFloorProjection'`, keyed on the header containing both
  `paw_name` and `plane_id`.
- `parsePawFloorCSV(text)` → `Map<frameId, { ts, paws: Map<pawName, PawHit> }>`, mirroring
  `parsePoseCSV`'s existing shape. `PawHit` carries `conf`, `screenX`, `screenY`, `hit`,
  `planeId`, and an optional `world`.
- **`paw_depth_m` is deliberately not parsed.** It is always empty, and surfacing it in the
  type invites a future reader to trust it.
- `sessionStore.loadPawFloorData(frameMap)`, alongside `loadPoseData` / `loadSensorData`.

### 2. Analysis — `src/features/paw-floor/analysis.ts`

Pure functions, no React, independently testable:

- `rayGeometry(hit, camPose)` → `{ depressionDeg, rangeM, metresPerPixel }`
- `stanceBaseline(frames, camPoses)` → per-pair median, relative IQR, and a `qualified`
  flag: **at least 3 paw-pairs carry ≥20 samples, and every such pair has relative IQR
  below 0.15**. The rule is phrased over *available* pairs rather than a fixed count of 4
  because a session can lose a paw entirely — `8410` supports only 3 pairs, since
  `right_back_paw` draws 29 samples, yet the 3 it has are stable to 0.02–0.06 and the
  session is genuinely usable. Against the six measured sessions this yields
  qualified = `8410`, `eec1`, `ec14`; not qualified = `3a89`, `dd26`, `c1d4`.
- `stanceResidual(frame, baseline, camPose)` → cm
- `fitSingleLift(frame, baseline, camPose)` → `{ paw, liftM }` or `null`; unreachable
  unless `baseline.qualified`
- `planeDrift(frames)` → per-plane y series, span, plane-switch points
- `sessionQuality(...)` → the struct behind the HUD verdict

Computed once on load and memoized. At ~1 500 rows per session this costs milliseconds.

### 3. Scene layer — `src/three/environment/PawFloorProjection.tsx`

Sits beside `ARPlanes` / `CameraTrail`. Per paw at the current frame:

- **Ray**, camera → hit. Colour by depression angle (≥55° green, 40–55° amber, <40° red),
  opacity by confidence. A shallow ray reads as visibly shallow; the thin triangle between
  ray and floor *is* the error term.
- **Hit disc**, radius `metresPerPixel × 10` — ten pixels of landmark error drawn to scale
  on the floor, making precision literal.
- **Miss stubs** — on `hit=0`, a dashed ray ending in an X, so dropouts read as
  present-and-failed rather than silently absent. This is what makes `right_back_paw` at
  29/588 obvious.
- **Fading tracks** — the last 2 s of hits per paw as a polyline on the plane, opacity
  ramping to zero at the tail.
- **Residual as shape** — the baseline stance quadrilateral ghosted against the actual,
  solid. The gap between them is the residual, with a numeric cm readout.
- **Gated lift stem** — dashed vertical from the corrected floor point to estimated paw
  height, drawn only when the baseline qualifies *and* the fit halves the residual.
  Labelled derived, off by default. Unavailable on `3a89` / `dd26` / `c1d4`, which is the
  correct outcome.
- **Plane drift** — tint the AR plane when the current `world_y` deviates >1 cm from the
  session median; mark plane switches on the track.

### 4. HUD verdict panel

Hit rate, cadence, per-paw sample counts with under-observation flags, depression p5/p50,
plane y-span and plane count, per-pair baseline stability, residual p50 — resolving to one
line, **TRUSTWORTHY / DEGRADED / UNRELIABLE**, with the reasons that drove it.

### 5. Testing

- **Analytic round-trip** (the strong one): place a camera and plane, put a paw at a known
  10 cm lift at 60° depression, assert the forward projection overshoots by 5.8 cm and
  `fitSingleLift` recovers 10 cm.
- **Parser** tests against a trimmed real-CSV fixture, including the UTF-8 BOM the recorder
  emits and rows with empty `world_*` on misses.
- **Gate** tests asserting `qualified` is true for `ec14` / `eec1` / `8410` and false for
  `dd26` / `c1d4`.

## Out of scope

- **Timeline quality ribbon** (per-paw presence lanes + residual sparkline). Deferred.
- **Video-overlay rendering.** The diagnostic lives entirely in the 3D scene.
- **Fixing `paw_depth_m` in the recorder.** It should be dropped or repurposed to
  camera-to-hit range (p50 1.43–1.55 m), but that touches the bundle contract across
  `unity-game`, `ml`, and `session-viewer` and deserves its own decision.

## Operational note

`session-viewer/.git/hooks/post-commit` builds and deploys to Cloudflare Pages on **every
commit**. Keep it disabled (`chmod -x`) during implementation.
