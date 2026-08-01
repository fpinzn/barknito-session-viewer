# Paw Floor-Projection Trust Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `paw_floor_projection_raycasting_v1` in the session viewer's 3D scene together with the diagnostics that say when to stop trusting it.

**Architecture:** Three layers, each independently testable. A parser turning the inference CSV into a per-frame map (mirroring `parsePoseCSV`); a pure-function analysis module in `src/features/paw-floor/` that derives ray geometry, stance baseline, residual, plane drift, and a session verdict; and a `PawFloorProjection` scene component alongside `ARPlanes`/`CameraTrail` plus a HUD verdict line. No React in the analysis module — all geometry is testable against analytically-known answers.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber` + `three`, `zustand` stores, `vitest` + jsdom.

## Global Constraints

- **Never parse `paw_depth_m`.** It is empty in all 7 183 measured rows; surfacing it in a type invites a future reader to trust it. It must not appear in `PawHit`.
- The raycast carries **no vertical information** — `world_y` is exactly the AR plane height. No code may present it as a measured paw height.
- Lift estimates are **derived, gated, and off by default**. Gate: at least 3 paw-pairs with ≥20 samples, and every such pair under 0.15 relative IQR.
- CSVs are written with a **UTF-8 BOM** (`﻿`) which must be stripped from the header, matching `parsePoseCSV`.
- Miss rows (`hit=0`) have **empty** `plane_id`, `world_x`, `world_y`, `world_z`. Parsing must not produce `NaN` coordinates for them.
- Follow existing file conventions: named exports, no default exports, `import type` for type-only imports, 2-space indent, no semicolons.
- `session-viewer/.git/hooks/post-commit` deploys to Cloudflare Pages on every commit. It is currently non-executable; **leave it that way** for the whole of this plan.
- Baseline before starting: `npx vitest run` → **133 tests passing in 24 files**. Every task must leave the suite green.

---

### Task 1: Paw floor CSV parser

**Files:**
- Modify: `src/types.ts` (append)
- Modify: `src/features/file-ingest/parsers.ts:5-9` (`detectCSVType`) and append parser
- Create: `src/features/file-ingest/fixtures/paw-floor-sample.csv`
- Create: `src/features/file-ingest/__tests__/paw-floor-parser.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `PawName`, `PawHit`, `PawFloorFrame` types; `parsePawFloorCSV(text: string): Map<number, PawFloorFrame>`; `detectCSVType` returning the new `'pawFloor'` literal.

There is no `test` script today even though vitest is configured in `vite.config.ts`. Add it as part of this task so every later task has one command to run.

- [ ] **Step 1: Add the `test` script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
```

- [ ] **Step 2: Create the fixture**

Create `src/features/file-ingest/fixtures/paw-floor-sample.csv`. These are real rows from `20260731-010534-dd26`. **The first character must be a UTF-8 BOM** (`﻿`), as the recorder emits one. Rows at ts 3001 are misses (empty tail fields); the rest are hits.

```
timestamp_ms,frame_id,model_id,model_version,method,paw_name,paw_confidence,paw_depth_m,screen_x_px,screen_y_px,hit,plane_id,world_x,world_y,world_z
3001,5138,paw_floor_projection_raycasting_v1,1.0.0,raycasting,left_front_paw,0.7788,,1114.0690,1646.5660,0,,,,
3001,5138,paw_floor_projection_raycasting_v1,1.0.0,raycasting,right_front_paw,0.7871,,976.0073,1754.2270,0,,,,
3584,5172,paw_floor_projection_raycasting_v1,1.0.0,raycasting,right_front_paw,0.8418,,664.0534,1758.9780,1,9647EAEC68C9D719-F223AA98606FC2BA,0.5296,-1.3214,0.9390
3584,5172,paw_floor_projection_raycasting_v1,1.0.0,raycasting,left_back_paw,0.4402,,1071.1140,2098.9800,1,9647EAEC68C9D719-F223AA98606FC2BA,1.3806,-1.3214,1.2957
3634,5175,paw_floor_projection_raycasting_v1,1.0.0,raycasting,left_front_paw,0.8521,,901.2196,1615.0940,1,9647EAEC68C9D719-F223AA98606FC2BA,0.5684,-1.3198,0.7985
3634,5175,paw_floor_projection_raycasting_v1,1.0.0,raycasting,right_front_paw,0.8413,,758.6536,1709.6090,1,9647EAEC68C9D719-F223AA98606FC2BA,0.4804,-1.3198,0.9502
3634,5175,paw_floor_projection_raycasting_v1,1.0.0,raycasting,left_back_paw,0.3838,,1181.6750,2042.2180,1,9647EAEC68C9D719-F223AA98606FC2BA,1.3337,-1.3198,1.3158
```

Prepend the BOM with:

```bash
printf '\xEF\xBB\xBF' | cat - src/features/file-ingest/fixtures/paw-floor-sample.csv > /tmp/pf.csv && mv /tmp/pf.csv src/features/file-ingest/fixtures/paw-floor-sample.csv
```

- [ ] **Step 3: Write the failing test**

Create `src/features/file-ingest/__tests__/paw-floor-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectCSVType, parsePawFloorCSV } from '../parsers'

const fixture = readFileSync(
  join(__dirname, '../fixtures/paw-floor-sample.csv'),
  'utf-8',
)

describe('detectCSVType', () => {
  it('detects the paw floor projection CSV', () => {
    const header = fixture.split('\n')[0]
    expect(detectCSVType(header)).toBe('pawFloor')
  })

  it('does not confuse it with the pose CSV', () => {
    expect(detectCSVType('timestamp_ms,frame_id,model_id,landmark,x,y,confidence'))
      .toBe('pose')
  })
})

describe('parsePawFloorCSV', () => {
  it('strips the BOM and groups rows by frame id', () => {
    const frames = parsePawFloorCSV(fixture)
    expect(frames.size).toBe(3)
    expect([...frames.keys()].sort((a, b) => a - b)).toEqual([5138, 5172, 5175])
  })

  it('records the timestamp per frame', () => {
    const frames = parsePawFloorCSV(fixture)
    expect(frames.get(5175)!.ts).toBe(3634)
  })

  it('parses a hit row with world coordinates', () => {
    const paw = parsePawFloorCSV(fixture).get(5175)!.paws.get('left_front_paw')!
    expect(paw.hit).toBe(true)
    expect(paw.conf).toBeCloseTo(0.8521, 4)
    expect(paw.screenX).toBeCloseTo(901.2196, 3)
    expect(paw.planeId).toBe('9647EAEC68C9D719-F223AA98606FC2BA')
    expect(paw.world).toEqual({ x: 0.5684, y: -1.3198, z: 0.7985 })
  })

  it('parses a miss row with null world, never NaN', () => {
    const paw = parsePawFloorCSV(fixture).get(5138)!.paws.get('left_front_paw')!
    expect(paw.hit).toBe(false)
    expect(paw.world).toBeNull()
    expect(paw.planeId).toBeNull()
    expect(paw.conf).toBeCloseTo(0.7788, 4)
  })

  it('keeps all paws present in a frame', () => {
    const frame = parsePawFloorCSV(fixture).get(5175)!
    expect([...frame.paws.keys()].sort()).toEqual(
      ['left_back_paw', 'left_front_paw', 'right_front_paw'],
    )
  })

  it('does not expose paw_depth_m', () => {
    const paw = parsePawFloorCSV(fixture).get(5175)!.paws.get('left_front_paw')!
    expect('depth' in paw).toBe(false)
    expect('depthM' in paw).toBe(false)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- paw-floor-parser`
Expected: FAIL — `parsePawFloorCSV is not a function`.

- [ ] **Step 5: Add the types**

Append to `src/types.ts`:

```typescript
export type PawName =
  | 'left_front_paw'
  | 'right_front_paw'
  | 'left_back_paw'
  | 'right_back_paw'

/**
 * One paw sample from `paw_floor_projection_raycasting_v1`.
 *
 * `world` is the raycast's intersection with a horizontal AR plane, so its `y`
 * is the plane's height, never a measured paw height. The CSV's `paw_depth_m`
 * column is deliberately not represented here: it is empty in every row the
 * recorder has ever written, because Vision's animal-pose request does not
 * populate the depth it is sourced from.
 */
export interface PawHit {
  conf: number
  screenX: number
  screenY: number
  hit: boolean
  planeId: string | null
  world: { x: number; y: number; z: number } | null
}

export interface PawFloorFrame {
  ts: number
  paws: Map<PawName, PawHit>
}
```

- [ ] **Step 6: Extend `detectCSVType`**

Replace `src/features/file-ingest/parsers.ts:5-9` with:

```typescript
export function detectCSVType(header: string): 'pose' | 'sensor' | 'pawFloor' | 'unknown' {
  if (header.includes('paw_name') && header.includes('plane_id')) return 'pawFloor'
  if (header.includes('landmark') && header.includes('model_id')) return 'pose'
  if (header.includes('cam_pos_x') && header.includes('cam_rot_x')) return 'sensor'
  return 'unknown'
}
```

The `pawFloor` check comes first because the paw CSV also carries `model_id`.

- [ ] **Step 7: Add the parser**

Append to `src/features/file-ingest/parsers.ts` (and add `PawFloorFrame`, `PawHit`, `PawName` to the existing `import type` on line 1):

```typescript
// ─── Paw Floor Projection CSV ───────────────────────────────────────

const PAW_NAMES: readonly string[] = [
  'left_front_paw', 'right_front_paw', 'left_back_paw', 'right_back_paw',
]

/** Parse an optional float column; empty string yields null, never NaN. */
function optFloat(raw: string | undefined): number | null {
  const t = (raw ?? '').trim()
  if (t === '') return null
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : null
}

export function parsePawFloorCSV(text: string): Map<number, PawFloorFrame> {
  const lines = text.trim().split('\n')
  const header = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim())
  const ci: Record<string, number> = {}
  header.forEach((h, i) => ci[h] = i)

  const frameMap = new Map<number, PawFloorFrame>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < header.length) continue

    const pawName = cols[ci['paw_name']].trim()
    if (!PAW_NAMES.includes(pawName)) continue

    const frameId = parseInt(cols[ci['frame_id']])
    const ts = parseInt(cols[ci['timestamp_ms']])
    if (!Number.isFinite(frameId) || !Number.isFinite(ts)) continue

    if (!frameMap.has(frameId)) frameMap.set(frameId, { ts, paws: new Map() })

    const hit = cols[ci['hit']].trim() === '1'
    const wx = optFloat(cols[ci['world_x']])
    const wy = optFloat(cols[ci['world_y']])
    const wz = optFloat(cols[ci['world_z']])
    const planeId = (cols[ci['plane_id']] ?? '').trim()

    frameMap.get(frameId)!.paws.set(pawName as PawName, {
      conf: parseFloat(cols[ci['paw_confidence']]),
      screenX: parseFloat(cols[ci['screen_x_px']]),
      screenY: parseFloat(cols[ci['screen_y_px']]),
      hit,
      planeId: planeId === '' ? null : planeId,
      world: hit && wx !== null && wy !== null && wz !== null
        ? { x: wx, y: wy, z: wz }
        : null,
    })
  }

  return frameMap
}
```

- [ ] **Step 8: Run the tests**

Run: `npm test -- paw-floor-parser`
Expected: PASS, 8 tests.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — 141 tests in 25 files (133 baseline + 8 new).

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/features/file-ingest/parsers.ts \
  src/features/file-ingest/fixtures/paw-floor-sample.csv \
  src/features/file-ingest/__tests__/paw-floor-parser.test.ts package.json
git commit -m "Add paw floor projection CSV parser"
```

---

### Task 2: Store and ingest wiring

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/features/file-ingest/ingest.ts:41-55`
- Create: `src/stores/__tests__/pawFloorStore.test.ts`

**Interfaces:**
- Consumes: `parsePawFloorCSV`, `PawFloorFrame` from Task 1.
- Produces: `useSessionStore` gains `pawFloorFrameMap: Map<number, PawFloorFrame> | null` and `loadPawFloorData(frameMap)`.

- [ ] **Step 1: Write the failing test**

Create `src/stores/__tests__/pawFloorStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '../sessionStore'
import { ingestText } from '../../features/file-ingest/ingest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fixture = readFileSync(
  join(__dirname, '../../features/file-ingest/fixtures/paw-floor-sample.csv'),
  'utf-8',
)

describe('paw floor store wiring', () => {
  beforeEach(() => {
    useSessionStore.getState().reset()
  })

  it('starts null', () => {
    expect(useSessionStore.getState().pawFloorFrameMap).toBeNull()
  })

  it('ingests the paw floor CSV into the store', () => {
    ingestText(fixture, 'paw_floor_projection_raycasting_v1.csv')
    const map = useSessionStore.getState().pawFloorFrameMap
    expect(map).not.toBeNull()
    expect(map!.size).toBe(3)
  })

  it('does not disturb pose or sensor state', () => {
    ingestText(fixture, 'paw_floor_projection_raycasting_v1.csv')
    expect(useSessionStore.getState().poseFrameMap).toBeNull()
    expect(useSessionStore.getState().sensorFrameMap).toBeNull()
  })

  it('clears on reset', () => {
    ingestText(fixture, 'paw_floor_projection_raycasting_v1.csv')
    useSessionStore.getState().reset()
    expect(useSessionStore.getState().pawFloorFrameMap).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- pawFloorStore`
Expected: FAIL — `pawFloorFrameMap` is undefined.

- [ ] **Step 3: Extend the store**

In `src/stores/sessionStore.ts`:

Add `PawFloorFrame` to the `import type` from `../types`. Add to the `SessionState` interface, next to `sensorFrameMap`:

```typescript
  pawFloorFrameMap: Map<number, PawFloorFrame> | null
```

Add to the actions block:

```typescript
  loadPawFloorData: (frameMap: Map<number, PawFloorFrame>) => void
```

Add to `initialState`, next to `sensorFrameMap`:

```typescript
  pawFloorFrameMap: null as Map<number, PawFloorFrame> | null,
```

Add the action alongside `loadSensorData`. It does **not** call `rebuild()` — the paw CSV is not a timeline source; `frames` stays driven by sensor/pose data:

```typescript
  loadPawFloorData: (frameMap) => set({ pawFloorFrameMap: frameMap }),
```

- [ ] **Step 4: Route it in ingest**

In `src/features/file-ingest/ingest.ts`, add `parsePawFloorCSV` to the import from `./parsers`, and add a case to the `switch (csvType)` block before `default`:

```typescript
    case 'pawFloor': {
      const frameMap = parsePawFloorCSV(text)
      store.loadPawFloorData(frameMap)
      break
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- pawFloorStore`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — 145 tests in 26 files.

- [ ] **Step 7: Commit**

```bash
git add src/stores/sessionStore.ts src/features/file-ingest/ingest.ts \
  src/stores/__tests__/pawFloorStore.test.ts
git commit -m "Wire paw floor projection data into the session store"
```

---

### Task 3: Ray geometry

**Files:**
- Create: `src/features/paw-floor/geometry.ts`
- Create: `src/features/paw-floor/__tests__/geometry.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (takes plain `{x,y,z}` records).
- Produces:
  - `type Vec3 = { x: number; y: number; z: number }`
  - `rayGeometry(hit: Vec3, cam: Vec3, focalPx: number): RayGeometry | null`
  - `interface RayGeometry { depressionDeg: number; rangeM: number; metresPerPixel: number }`
  - `correctForLift(hit: Vec3, cam: Vec3, liftM: number): { x: number; z: number }`

The maths, stated once so later tasks can rely on it. Camera at `C`, raycast hit `Q` on a horizontal plane. `H = C.y − Q.y` is camera height above the plane; `R` is the horizontal distance from the camera's nadir to `Q`. The depression angle is `δ = atan2(H, R)`.

A paw lifted `h` above the plane has its ray continue to the floor, landing `h / tan δ` *further* from the nadir. Undoing that means pulling the point back along the nadir→hit direction by exactly `h / tan δ`.

Sensitivity to landmark noise is `dR/dδ = H / sin²δ`, and one camera pixel subtends `1 / focalPx` radians, so a pixel of landmark error moves the floor point by `H / (sin²δ · focalPx)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/paw-floor/__tests__/geometry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { rayGeometry, correctForLift } from '../geometry'

// Camera 1.5 m above a plane at y=0, nadir at the origin.
const cam = { x: 0, y: 1.5, z: 0 }
const FOCAL = 1357.692626953125 // focalLengthX from a real session_meta.json

describe('rayGeometry', () => {
  it('computes a 60 degree depression for R = H/tan(60)', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180) // 0.8660254
    const g = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    expect(g.depressionDeg).toBeCloseTo(60, 6)
  })

  it('computes range as the full 3D distance', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const g = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    expect(g.rangeM).toBeCloseTo(Math.hypot(R, 1.5), 6)
  })

  it('is direction agnostic', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const a = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    const b = rayGeometry({ x: 0, y: 0, z: -R }, cam, FOCAL)!
    expect(b.depressionDeg).toBeCloseTo(a.depressionDeg, 9)
  })

  it('reports sub-centimetre sensitivity at steep angles', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const g = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    // H / (sin^2(60) * focal) = 1.5 / (0.75 * 1357.69) = 0.001473 m
    expect(g.metresPerPixel).toBeCloseTo(0.001473, 6)
  })

  it('sensitivity blows up as the ray grazes the floor', () => {
    const steep = rayGeometry({ x: 0.2, y: 0, z: 0 }, cam, FOCAL)!
    const shallow = rayGeometry({ x: 8.0, y: 0, z: 0 }, cam, FOCAL)!
    expect(shallow.metresPerPixel).toBeGreaterThan(steep.metresPerPixel * 10)
  })

  it('returns null when the camera is at or below the plane', () => {
    expect(rayGeometry({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, FOCAL)).toBeNull()
    expect(rayGeometry({ x: 1, y: 0, z: 0 }, { x: 0, y: -0.5, z: 0 }, FOCAL)).toBeNull()
  })

  it('returns null when the hit is directly under the camera', () => {
    expect(rayGeometry({ x: 0, y: 0, z: 0 }, cam, FOCAL)).toBeNull()
  })
})

describe('correctForLift', () => {
  it('is a no-op for a planted paw', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const p = correctForLift({ x: R, y: 0, z: 0 }, cam, 0)
    expect(p.x).toBeCloseTo(R, 9)
    expect(p.z).toBeCloseTo(0, 9)
  })

  it('pulls a 10 cm lift back by lift/tan(depression)', () => {
    // A paw truly at horizontal radius 0.80 m, lifted 0.10 m, projects to
    // 0.80 * 1.5/1.40 = 0.857142857 on the floor.
    const recorded = { x: 0.857142857, y: 0, z: 0 }
    const p = correctForLift(recorded, cam, 0.10)
    expect(p.x).toBeCloseTo(0.80, 6)
    expect(p.z).toBeCloseTo(0, 9)
  })

  it('matches the 5.8 cm overshoot for a 10 cm lift at 60 degrees', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const p = correctForLift({ x: R, y: 0, z: 0 }, cam, 0.10)
    expect(R - p.x).toBeCloseTo(0.0577350, 6)
  })

  it('corrects along the nadir direction, not an axis', () => {
    const recorded = { x: 0, y: 0, z: 0.857142857 }
    const p = correctForLift(recorded, cam, 0.10)
    expect(p.z).toBeCloseTo(0.80, 6)
    expect(p.x).toBeCloseTo(0, 9)
  })

  it('never pulls past the camera nadir', () => {
    const p = correctForLift({ x: 0.05, y: 0, z: 0 }, cam, 2.0)
    expect(p.x).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- geometry`
Expected: FAIL — cannot resolve `../geometry`.

- [ ] **Step 3: Implement**

Create `src/features/paw-floor/geometry.ts`:

```typescript
export type Vec3 = { x: number; y: number; z: number }

export interface RayGeometry {
  /** Angle of the camera→hit ray below horizontal, in degrees. */
  depressionDeg: number
  /** Full 3D camera→hit distance in metres. */
  rangeM: number
  /**
   * How far the floor intersection moves per pixel of landmark error:
   * H / (sin²δ · focal). Small values mean a well-conditioned projection.
   */
  metresPerPixel: number
}

const EPS = 1e-6

export function rayGeometry(hit: Vec3, cam: Vec3, focalPx: number): RayGeometry | null {
  const height = cam.y - hit.y
  if (height <= EPS) return null

  const dx = hit.x - cam.x
  const dz = hit.z - cam.z
  const radius = Math.hypot(dx, dz)
  if (radius <= EPS) return null

  const delta = Math.atan2(height, radius)
  const sinDelta = Math.sin(delta)

  return {
    depressionDeg: (delta * 180) / Math.PI,
    rangeM: Math.hypot(radius, height),
    metresPerPixel: height / (sinDelta * sinDelta * focalPx),
  }
}

/**
 * Undo the overshoot a lifted paw introduces.
 *
 * A paw `liftM` above the plane has its view ray continue to the floor, landing
 * `liftM / tan δ` further from the camera's nadir than the paw really is. Pull
 * the recorded point back along the nadir→hit direction by that amount.
 */
export function correctForLift(hit: Vec3, cam: Vec3, liftM: number): { x: number; z: number } {
  const dx = hit.x - cam.x
  const dz = hit.z - cam.z
  const radius = Math.hypot(dx, dz)
  const height = cam.y - hit.y

  if (radius <= EPS || height <= EPS || liftM <= 0) {
    return { x: hit.x, z: hit.z }
  }

  const tanDelta = height / radius
  // Clamp so an implausible lift can never pull the point past the nadir.
  const pull = Math.min(liftM / tanDelta, radius * 0.95)

  return {
    x: hit.x - (dx / radius) * pull,
    z: hit.z - (dz / radius) * pull,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- geometry`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/paw-floor/geometry.ts src/features/paw-floor/__tests__/geometry.test.ts
git commit -m "Add paw floor ray geometry and lift correction"
```

---

### Task 4: Stance baseline and residual

**Files:**
- Create: `src/features/paw-floor/stance.ts`
- Create: `src/features/paw-floor/__tests__/stance.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `correctForLift` from Task 3; `PawName`, `PawFloorFrame` from Task 1.
- Produces:
  - `type PawPositions = Map<PawName, Vec3>`
  - `type Lifts = Partial<Record<PawName, number>>`
  - `interface PairStat { pair: [PawName, PawName]; median: number; relIQR: number; samples: number }`
  - `interface StanceBaseline { pairs: PairStat[]; qualified: boolean }`
  - `stanceBaseline(observations: Array<{ paws: PawPositions; cam: Vec3 }>): StanceBaseline`
  - `stanceResidualM(paws: PawPositions, cam: Vec3, baseline: StanceBaseline, lifts?: Lifts): number | null`

The residual is the RMS deviation, in metres, of the frame's observed inter-paw distances from the session's baseline medians. Only pairs present in both are counted; a frame with fewer than 2 usable pairs yields `null`.

- [ ] **Step 1: Write the failing test**

Create `src/features/paw-floor/__tests__/stance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { stanceBaseline, stanceResidualM, type PawPositions } from '../stance'
import type { PawName } from '../../../types'

const cam = { x: 0, y: 1.5, z: 0 }

/** A planted stance: 0.17 m across, 0.38 m front-to-back. */
function plantedStance(offset = 0): PawPositions {
  return new Map<PawName, { x: number; y: number; z: number }>([
    ['left_front_paw', { x: 0.80 + offset, y: 0, z: 0.00 }],
    ['right_front_paw', { x: 0.80 + offset, y: 0, z: 0.17 }],
    ['left_back_paw', { x: 1.18 + offset, y: 0, z: 0.00 }],
    ['right_back_paw', { x: 1.18 + offset, y: 0, z: 0.17 }],
  ])
}

const planted = Array.from({ length: 30 }, (_, i) => ({
  paws: plantedStance(i * 0.001),
  cam,
}))

describe('stanceBaseline', () => {
  it('recovers the pairwise medians of a rigid stance', () => {
    const b = stanceBaseline(planted)
    const find = (a: PawName, c: PawName) =>
      b.pairs.find(p =>
        (p.pair[0] === a && p.pair[1] === c) || (p.pair[0] === c && p.pair[1] === a))!
    expect(find('left_front_paw', 'right_front_paw').median).toBeCloseTo(0.17, 3)
    expect(find('left_front_paw', 'left_back_paw').median).toBeCloseTo(0.38, 3)
  })

  it('qualifies a rigid stance', () => {
    expect(stanceBaseline(planted).qualified).toBe(true)
  })

  it('reports near-zero relative IQR for a rigid stance', () => {
    for (const p of stanceBaseline(planted).pairs) {
      expect(p.relIQR).toBeLessThan(0.05)
    }
  })

  it('does not qualify when pairs have too few samples', () => {
    expect(stanceBaseline(planted.slice(0, 5)).qualified).toBe(false)
  })

  it('qualifies on three stable pairs when a paw is missing entirely', () => {
    // Mirrors session 8410: right_back_paw is almost never detected, leaving
    // only three pairs, but the three are tight and the session is usable.
    const threePaw = planted.map(o => {
      const paws = new Map(o.paws)
      paws.delete('right_back_paw')
      return { paws, cam }
    })
    const b = stanceBaseline(threePaw)
    expect(b.pairs.length).toBe(3)
    expect(b.qualified).toBe(true)
  })

  it('does not qualify a loose stance', () => {
    // Mirrors the moving sessions: front paws swing between 0.05 and 0.35 m.
    const loose = planted.map((o, i) => {
      const paws = new Map(o.paws)
      paws.set('right_front_paw', { x: 0.80, y: 0, z: i % 2 === 0 ? 0.05 : 0.35 })
      return { paws, cam }
    })
    expect(stanceBaseline(loose).qualified).toBe(false)
  })
})

describe('stanceResidualM', () => {
  it('is ~zero for a frame matching the baseline', () => {
    const b = stanceBaseline(planted)
    expect(stanceResidualM(plantedStance(), cam, b)!).toBeLessThan(0.005)
  })

  it('grows when a paw is displaced', () => {
    const b = stanceBaseline(planted)
    const bad = plantedStance()
    bad.set('left_front_paw', { x: 1.10, y: 0, z: 0.00 })
    const good = stanceResidualM(plantedStance(), cam, b)!
    const worse = stanceResidualM(bad, cam, b)!
    expect(worse).toBeGreaterThan(good + 0.05)
  })

  it('applies a lift correction before measuring', () => {
    const b = stanceBaseline(planted)
    // left_front_paw lifted 0.10 m projects from 0.80 to 0.857142857.
    const lifted = plantedStance()
    lifted.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })
    const uncorrected = stanceResidualM(lifted, cam, b)!
    const corrected = stanceResidualM(lifted, cam, b, { left_front_paw: 0.10 })!
    expect(corrected).toBeLessThan(uncorrected / 2)
  })

  it('returns null with fewer than two usable pairs', () => {
    const b = stanceBaseline(planted)
    const one = new Map(plantedStance())
    one.delete('left_back_paw')
    one.delete('right_back_paw')
    one.delete('right_front_paw')
    expect(stanceResidualM(one, cam, b)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- stance`
Expected: FAIL — cannot resolve `../stance`.

- [ ] **Step 3: Implement**

Create `src/features/paw-floor/stance.ts`:

```typescript
import type { PawName } from '../../types'
import { correctForLift, type Vec3 } from './geometry'

export type PawPositions = Map<PawName, Vec3>
export type Lifts = Partial<Record<PawName, number>>

export interface PairStat {
  pair: [PawName, PawName]
  median: number
  relIQR: number
  samples: number
}

export interface StanceBaseline {
  pairs: PairStat[]
  qualified: boolean
}

const PAW_ORDER: PawName[] = [
  'left_front_paw', 'right_front_paw', 'left_back_paw', 'right_back_paw',
]

/** A pair needs this many samples before its statistics mean anything. */
export const MIN_PAIR_SAMPLES = 20
/** A pair is "stable" below this relative interquartile range. */
export const MAX_STABLE_REL_IQR = 0.15
/** Fewer qualifying pairs than this and the baseline is not usable. */
export const MIN_QUALIFIED_PAIRS = 3

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
}

function pairKey(a: PawName, b: PawName): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function corrected(paws: PawPositions, cam: Vec3, lifts: Lifts): Map<PawName, { x: number; z: number }> {
  const out = new Map<PawName, { x: number; z: number }>()
  for (const [name, pos] of paws) {
    out.set(name, correctForLift(pos, cam, lifts[name] ?? 0))
  }
  return out
}

export function stanceBaseline(
  observations: Array<{ paws: PawPositions; cam: Vec3 }>,
): StanceBaseline {
  const samples = new Map<string, number[]>()

  for (const obs of observations) {
    const pos = corrected(obs.paws, obs.cam, {})
    for (let i = 0; i < PAW_ORDER.length; i++) {
      for (let j = i + 1; j < PAW_ORDER.length; j++) {
        const a = pos.get(PAW_ORDER[i])
        const b = pos.get(PAW_ORDER[j])
        if (!a || !b) continue
        const key = pairKey(PAW_ORDER[i], PAW_ORDER[j])
        if (!samples.has(key)) samples.set(key, [])
        samples.get(key)!.push(Math.hypot(a.x - b.x, a.z - b.z))
      }
    }
  }

  const pairs: PairStat[] = []
  for (const [key, values] of samples) {
    if (values.length < MIN_PAIR_SAMPLES) continue
    const sorted = [...values].sort((m, n) => m - n)
    const median = quantile(sorted, 0.5)
    const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25)
    const [a, b] = key.split('|') as [PawName, PawName]
    pairs.push({
      pair: [a, b],
      median,
      relIQR: median > 0 ? iqr / median : Infinity,
      samples: values.length,
    })
  }

  // Phrased over *available* pairs, not a fixed count: a session can lose a paw
  // entirely and still be usable if the pairs it does have are tight.
  const qualified =
    pairs.length >= MIN_QUALIFIED_PAIRS &&
    pairs.every(p => p.relIQR < MAX_STABLE_REL_IQR)

  return { pairs, qualified }
}

export function stanceResidualM(
  paws: PawPositions,
  cam: Vec3,
  baseline: StanceBaseline,
  lifts: Lifts = {},
): number | null {
  const pos = corrected(paws, cam, lifts)
  let sum = 0
  let count = 0

  for (const stat of baseline.pairs) {
    const a = pos.get(stat.pair[0])
    const b = pos.get(stat.pair[1])
    if (!a || !b) continue
    const observed = Math.hypot(a.x - b.x, a.z - b.z)
    const diff = observed - stat.median
    sum += diff * diff
    count++
  }

  if (count < 2) return null
  return Math.sqrt(sum / count)
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- stance`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/paw-floor/stance.ts src/features/paw-floor/__tests__/stance.test.ts
git commit -m "Add stance baseline and residual for paw floor projections"
```

---

### Task 5: Gated lift fit

**Files:**
- Create: `src/features/paw-floor/lift.ts`
- Create: `src/features/paw-floor/__tests__/lift.test.ts`

**Interfaces:**
- Consumes: `PawPositions`, `Lifts`, `StanceBaseline`, `stanceResidualM` from Task 4; `Vec3` from Task 3.
- Produces: `interface LiftFit { paw: PawName; liftM: number; residualBeforeM: number; residualAfterM: number }` and `fitSingleLift(paws, cam, baseline): LiftFit | null`.

This is the feature the spec deliberately fences in. It searches one lifted paw at 1 cm granularity up to 40 cm and returns a result **only** when the baseline qualifies and the fit at least halves the residual. On the measured sessions it is available on `8410`/`eec1`/`ec14` and unavailable on `3a89`/`dd26`/`c1d4`.

- [ ] **Step 1: Write the failing test**

Create `src/features/paw-floor/__tests__/lift.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { fitSingleLift } from '../lift'
import { stanceBaseline, type PawPositions } from '../stance'
import type { PawName } from '../../../types'

const cam = { x: 0, y: 1.5, z: 0 }

function plantedStance(offset = 0): PawPositions {
  return new Map<PawName, { x: number; y: number; z: number }>([
    ['left_front_paw', { x: 0.80 + offset, y: 0, z: 0.00 }],
    ['right_front_paw', { x: 0.80 + offset, y: 0, z: 0.17 }],
    ['left_back_paw', { x: 1.18 + offset, y: 0, z: 0.00 }],
    ['right_back_paw', { x: 1.18 + offset, y: 0, z: 0.17 }],
  ])
}

const planted = Array.from({ length: 30 }, (_, i) => ({ paws: plantedStance(i * 0.001), cam }))
const qualified = stanceBaseline(planted)

describe('fitSingleLift', () => {
  it('recovers a known 10 cm lift and names the right paw', () => {
    // 0.80 m radius lifted 0.10 m projects to 0.80 * 1.5/1.40 = 0.857142857.
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })

    const fit = fitSingleLift(frame, cam, qualified)!
    expect(fit.paw).toBe('left_front_paw')
    expect(fit.liftM).toBeCloseTo(0.10, 2)
  })

  it('reports a residual improvement', () => {
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })
    const fit = fitSingleLift(frame, cam, qualified)!
    expect(fit.residualAfterM).toBeLessThan(fit.residualBeforeM / 2)
  })

  it('recovers a lift on a back paw too', () => {
    // 1.18 m radius lifted 0.10 m projects to 1.18 * 1.5/1.40 = 1.264285714.
    const frame = plantedStance()
    frame.set('left_back_paw', { x: 1.264285714, y: 0, z: 0.00 })
    const fit = fitSingleLift(frame, cam, qualified)!
    expect(fit.paw).toBe('left_back_paw')
    expect(fit.liftM).toBeCloseTo(0.10, 2)
  })

  it('returns null for a fully planted frame', () => {
    expect(fitSingleLift(plantedStance(), cam, qualified)).toBeNull()
  })

  it('returns null when the baseline does not qualify', () => {
    const loose = stanceBaseline(planted.slice(0, 5))
    expect(loose.qualified).toBe(false)
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })
    expect(fitSingleLift(frame, cam, loose)).toBeNull()
  })

  it('never returns a lift at the search ceiling', () => {
    // Garbage geometry must not be rescued by pinning the lift at the cap —
    // this is the failure mode that got the estimator gated in the first place.
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 3.0, y: 0, z: 2.0 })
    const fit = fitSingleLift(frame, cam, qualified)
    expect(fit === null || fit.liftM < 0.40).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lift`
Expected: FAIL — cannot resolve `../lift`.

- [ ] **Step 3: Implement**

Create `src/features/paw-floor/lift.ts`:

```typescript
import type { PawName } from '../../types'
import type { Vec3 } from './geometry'
import { stanceResidualM, type PawPositions, type StanceBaseline } from './stance'

export interface LiftFit {
  paw: PawName
  liftM: number
  residualBeforeM: number
  residualAfterM: number
}

/** Search granularity and ceiling for the single-lift solver. */
const STEP_M = 0.01
const MAX_LIFT_M = 0.40
/** A fit must at least halve the residual to be reported. */
const REQUIRED_IMPROVEMENT = 0.5

/**
 * Estimate which single paw is lifted, and by how much.
 *
 * Gated behind `baseline.qualified` on purpose. Allowed to run against a loose
 * baseline the solver absorbs gait into the lift parameter and pins every paw
 * against the ceiling — measured at 21–26 cm "lifts" for a standing dog on
 * session 20260731-010534-dd26. Returns null rather than guess.
 */
export function fitSingleLift(
  paws: PawPositions,
  cam: Vec3,
  baseline: StanceBaseline,
): LiftFit | null {
  if (!baseline.qualified) return null

  const before = stanceResidualM(paws, cam, baseline)
  if (before === null) return null

  let best: LiftFit | null = null

  for (const paw of paws.keys()) {
    for (let lift = STEP_M; lift <= MAX_LIFT_M + 1e-9; lift += STEP_M) {
      const after = stanceResidualM(paws, cam, baseline, { [paw]: lift })
      if (after === null) continue
      if (best === null || after < best.residualAfterM) {
        best = { paw, liftM: lift, residualBeforeM: before, residualAfterM: after }
      }
    }
  }

  if (best === null) return null
  // Reject a fit that merely nudged the residual, and reject one that only
  // "works" by saturating the search — both mean the model does not apply.
  if (best.residualAfterM > before * REQUIRED_IMPROVEMENT) return null
  if (best.liftM >= MAX_LIFT_M - 1e-9) return null

  return best
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lift`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/paw-floor/lift.ts src/features/paw-floor/__tests__/lift.test.ts
git commit -m "Add gated single-paw lift estimator"
```

---

### Task 6: Session quality verdict

**Files:**
- Create: `src/features/paw-floor/quality.ts`
- Create: `src/features/paw-floor/__tests__/quality.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces:
  - `interface SessionQuality { verdict: 'TRUSTWORTHY' | 'DEGRADED' | 'UNRELIABLE'; reasons: string[]; hitRate: number; sampleCount: number; pawCounts: Record<PawName, number>; depressionP5: number; depressionP50: number; planeYSpanM: number; planeCount: number; residualP50M: number; baseline: StanceBaseline }`
  - `sessionQuality(input: QualityInput): SessionQuality | null`
  - `interface QualityInput { pawFrames: Map<number, PawFloorFrame>; camFor: (frameId: number) => Vec3 | null; focalPx: number }`

Thresholds, chosen against the six measured sessions so the verdict spreads sensibly (`8410`/`eec1`/`ec14` → TRUSTWORTHY, `3a89`/`c1d4` → DEGRADED, `dd26` → UNRELIABLE):

| verdict | triggered by |
|---|---|
| UNRELIABLE | hit rate < 0.80, or depression p5 < 30°, or plane y-span > 5 cm, or more than one plane used |
| DEGRADED | baseline not qualified, or residual p50 > 3 cm, or depression p5 < 45°, or any paw under 10% of the best-observed paw's count |
| TRUSTWORTHY | none of the above |

- [ ] **Step 1: Write the failing test**

Create `src/features/paw-floor/__tests__/quality.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sessionQuality } from '../quality'
import type { PawFloorFrame, PawName } from '../../../types'

const cam = { x: 0, y: 1.5, z: 0 }
const FOCAL = 1357.692626953125
const camFor = () => cam

/** Build N frames of a rigid, well-observed, steeply-viewed stance. */
function goodFrames(n: number, planeY = 0): Map<number, PawFloorFrame> {
  const coords: Array<[PawName, number, number]> = [
    ['left_front_paw', 0.80, 0.00],
    ['right_front_paw', 0.80, 0.17],
    ['left_back_paw', 1.18, 0.00],
    ['right_back_paw', 1.18, 0.17],
  ]
  const frames = new Map<number, PawFloorFrame>()
  for (let i = 0; i < n; i++) {
    const paws = new Map()
    for (const [name, x, z] of coords) {
      paws.set(name, {
        conf: 0.8, screenX: 500, screenY: 900, hit: true,
        planeId: 'PLANE_A',
        world: { x: x + i * 0.001, y: planeY, z },
      })
    }
    frames.set(i, { ts: i * 33, paws })
  }
  return frames
}

describe('sessionQuality', () => {
  it('returns null with no usable frames', () => {
    expect(sessionQuality({ pawFrames: new Map(), camFor, focalPx: FOCAL })).toBeNull()
  })

  it('rates a clean session TRUSTWORTHY', () => {
    const q = sessionQuality({ pawFrames: goodFrames(60), camFor, focalPx: FOCAL })!
    expect(q.verdict).toBe('TRUSTWORTHY')
    expect(q.reasons).toEqual([])
    expect(q.hitRate).toBeCloseTo(1, 6)
    expect(q.sampleCount).toBe(240)
  })

  it('counts per-paw samples', () => {
    const q = sessionQuality({ pawFrames: goodFrames(60), camFor, focalPx: FOCAL })!
    expect(q.pawCounts.left_front_paw).toBe(60)
    expect(q.pawCounts.right_back_paw).toBe(60)
  })

  it('flags a session that used more than one plane as UNRELIABLE', () => {
    const frames = goodFrames(60)
    for (const [id, f] of frames) {
      if (id < 20) {
        for (const paw of f.paws.values()) {
          paw.planeId = 'PLANE_B'
          paw.world = { ...paw.world!, y: -0.09 }
        }
      }
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.verdict).toBe('UNRELIABLE')
    expect(q.planeCount).toBe(2)
    expect(q.reasons.join(' ')).toMatch(/plane/i)
  })

  it('flags a low hit rate as UNRELIABLE', () => {
    const frames = goodFrames(60)
    for (const [id, f] of frames) {
      if (id < 40) {
        for (const paw of f.paws.values()) {
          paw.hit = false
          paw.world = null
          paw.planeId = null
        }
      }
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.hitRate).toBeCloseTo(1 / 3, 2)
    expect(q.verdict).toBe('UNRELIABLE')
  })

  it('flags an under-observed paw as DEGRADED', () => {
    const frames = goodFrames(60)
    for (const [id, f] of frames) {
      if (id >= 3) f.paws.delete('right_back_paw')
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.pawCounts.right_back_paw).toBe(3)
    expect(q.verdict).toBe('DEGRADED')
    expect(q.reasons.join(' ')).toMatch(/right_back_paw/)
  })

  it('flags plane drift beyond 5 cm as UNRELIABLE', () => {
    const frames = goodFrames(60)
    let i = 0
    for (const [, f] of frames) {
      for (const paw of f.paws.values()) paw.world = { ...paw.world!, y: i * 0.002 }
      i++
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.planeYSpanM).toBeGreaterThan(0.05)
    expect(q.verdict).toBe('UNRELIABLE')
  })

  it('reports depression percentiles', () => {
    const q = sessionQuality({ pawFrames: goodFrames(60), camFor, focalPx: FOCAL })!
    expect(q.depressionP50).toBeGreaterThan(45)
    expect(q.depressionP50).toBeLessThan(90)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- quality`
Expected: FAIL — cannot resolve `../quality`.

- [ ] **Step 3: Implement**

Create `src/features/paw-floor/quality.ts`:

```typescript
import type { PawFloorFrame, PawName } from '../../types'
import { rayGeometry, type Vec3 } from './geometry'
import { stanceBaseline, stanceResidualM, type PawPositions, type StanceBaseline } from './stance'

export type Verdict = 'TRUSTWORTHY' | 'DEGRADED' | 'UNRELIABLE'

export interface SessionQuality {
  verdict: Verdict
  reasons: string[]
  hitRate: number
  sampleCount: number
  pawCounts: Record<PawName, number>
  depressionP5: number
  depressionP50: number
  planeYSpanM: number
  planeCount: number
  residualP50M: number
  baseline: StanceBaseline
}

export interface QualityInput {
  pawFrames: Map<number, PawFloorFrame>
  camFor: (frameId: number) => Vec3 | null
  focalPx: number
}

const MIN_HIT_RATE = 0.80
const MIN_DEPRESSION_P5_UNRELIABLE = 30
const MIN_DEPRESSION_P5_DEGRADED = 45
const MAX_PLANE_Y_SPAN_M = 0.05
const MAX_RESIDUAL_P50_M = 0.03
const MIN_PAW_SHARE = 0.10

function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
}

export function sessionQuality(input: QualityInput): SessionQuality | null {
  const { pawFrames, camFor, focalPx } = input
  if (pawFrames.size === 0) return null

  const pawCounts: Record<PawName, number> = {
    left_front_paw: 0, right_front_paw: 0, left_back_paw: 0, right_back_paw: 0,
  }
  const depressions: number[] = []
  const planeIds = new Set<string>()
  const planeYs: number[] = []
  const observations: Array<{ paws: PawPositions; cam: Vec3 }> = []

  let sampleCount = 0
  let hitCount = 0

  for (const [frameId, frame] of pawFrames) {
    const cam = camFor(frameId)
    const positions: PawPositions = new Map()

    for (const [name, paw] of frame.paws) {
      sampleCount++
      if (!paw.hit || !paw.world) continue
      hitCount++
      pawCounts[name]++
      planeYs.push(paw.world.y)
      if (paw.planeId) planeIds.add(paw.planeId)
      positions.set(name, paw.world)

      if (cam) {
        const geom = rayGeometry(paw.world, cam, focalPx)
        if (geom) depressions.push(geom.depressionDeg)
      }
    }

    if (cam && positions.size >= 2) observations.push({ paws: positions, cam })
  }

  if (sampleCount === 0) return null

  const baseline = stanceBaseline(observations)
  const residuals: number[] = []
  for (const obs of observations) {
    const r = stanceResidualM(obs.paws, obs.cam, baseline)
    if (r !== null) residuals.push(r)
  }

  const hitRate = hitCount / sampleCount
  const depressionP5 = percentile(depressions, 0.05)
  const depressionP50 = percentile(depressions, 0.5)
  const planeYSpanM = planeYs.length > 0 ? Math.max(...planeYs) - Math.min(...planeYs) : 0
  const residualP50M = residuals.length > 0 ? percentile(residuals, 0.5) : NaN

  const unreliable: string[] = []
  const degraded: string[] = []

  if (hitRate < MIN_HIT_RATE) {
    unreliable.push(`hit rate ${(hitRate * 100).toFixed(0)}% below ${MIN_HIT_RATE * 100}%`)
  }
  if (Number.isFinite(depressionP5) && depressionP5 < MIN_DEPRESSION_P5_UNRELIABLE) {
    unreliable.push(`rays graze the floor (p5 depression ${depressionP5.toFixed(0)}°)`)
  }
  if (planeIds.size > 1) {
    unreliable.push(`${planeIds.size} planes used — hits sit on disagreeing heights`)
  }
  if (planeYSpanM > MAX_PLANE_Y_SPAN_M) {
    unreliable.push(`plane height moved ${(planeYSpanM * 100).toFixed(1)} cm`)
  }

  if (!baseline.qualified) {
    degraded.push('stance baseline not stable enough to validate frames')
  }
  if (Number.isFinite(residualP50M) && residualP50M > MAX_RESIDUAL_P50_M) {
    degraded.push(`median stance residual ${(residualP50M * 100).toFixed(1)} cm`)
  }
  if (Number.isFinite(depressionP5) && depressionP5 < MIN_DEPRESSION_P5_DEGRADED) {
    degraded.push(`shallow viewing angle (p5 depression ${depressionP5.toFixed(0)}°)`)
  }

  const bestPawCount = Math.max(...Object.values(pawCounts))
  if (bestPawCount > 0) {
    for (const [name, count] of Object.entries(pawCounts) as Array<[PawName, number]>) {
      if (count < bestPawCount * MIN_PAW_SHARE) {
        degraded.push(`${name} barely observed (${count} vs ${bestPawCount})`)
      }
    }
  }

  const verdict: Verdict =
    unreliable.length > 0 ? 'UNRELIABLE' : degraded.length > 0 ? 'DEGRADED' : 'TRUSTWORTHY'

  return {
    verdict,
    reasons: [...unreliable, ...degraded],
    hitRate,
    sampleCount,
    pawCounts,
    depressionP5,
    depressionP50,
    planeYSpanM,
    planeCount: planeIds.size,
    residualP50M,
    baseline,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- quality`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — 181 tests in 30 files. (133 baseline + 8 + 4 + 12 + 10 + 6 + 8.)

- [ ] **Step 6: Commit**

```bash
git add src/features/paw-floor/quality.ts src/features/paw-floor/__tests__/quality.test.ts
git commit -m "Add paw floor session quality verdict"
```

---

### Task 7: Scene layer

**Files:**
- Create: `src/features/paw-floor/usePawFloorAnalysis.ts`
- Create: `src/three/environment/PawFloorProjection.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/three/SceneCanvas.tsx:8` and `:31`
- Create: `src/features/paw-floor/__tests__/usePawFloorAnalysis.test.ts`

**Interfaces:**
- Consumes: `sessionQuality`, `stanceResidualM`, `fitSingleLift`, `rayGeometry` from Tasks 3–6; `pawFloorFrameMap` from Task 2.
- Produces: `usePawFloorAnalysis(): PawFloorAnalysis | null` with `{ quality, camFor, focalPx }`; `PawFloorProjection` component; `uiStore` gains `showPawFloor` (default `true`) and `showPawLift` (default `false`).

Colour thresholds for the ray, from the spec: **≥55° green** (`0x44dd88`), **40–55° amber** (`0xddaa44`), **<40° red** (`0xdd4444`).

- [ ] **Step 1: Write the failing test for the analysis hook's pure core**

Create `src/features/paw-floor/__tests__/usePawFloorAnalysis.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { rayColorHex, buildCamLookup } from '../usePawFloorAnalysis'

describe('rayColorHex', () => {
  it('is green at or above 55 degrees', () => {
    expect(rayColorHex(55)).toBe(0x44dd88)
    expect(rayColorHex(70)).toBe(0x44dd88)
  })

  it('is amber between 40 and 55 degrees', () => {
    expect(rayColorHex(40)).toBe(0xddaa44)
    expect(rayColorHex(54.9)).toBe(0xddaa44)
  })

  it('is red below 40 degrees', () => {
    expect(rayColorHex(39.9)).toBe(0xdd4444)
    expect(rayColorHex(10)).toBe(0xdd4444)
  })
})

describe('buildCamLookup', () => {
  const sensorMap = new Map([
    [100, { ts: 0, pos: { x: 1, y: 2, z: 3 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    [104, { ts: 33, pos: { x: 4, y: 5, z: 6 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
  ])

  it('returns the exact frame when present', () => {
    expect(buildCamLookup(sensorMap)(100)).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('falls back to the nearest frame within tolerance', () => {
    expect(buildCamLookup(sensorMap)(102)).toEqual({ x: 4, y: 5, z: 6 })
  })

  it('returns null when nothing is close enough', () => {
    expect(buildCamLookup(sensorMap)(500)).toBeNull()
  })

  it('returns null for an empty map', () => {
    expect(buildCamLookup(new Map())(100)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- usePawFloorAnalysis`
Expected: FAIL — cannot resolve `../usePawFloorAnalysis`.

- [ ] **Step 3: Implement the analysis hook**

Create `src/features/paw-floor/usePawFloorAnalysis.ts`:

```typescript
import { useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { sessionQuality, type SessionQuality } from './quality'
import type { Vec3 } from './geometry'

/** Nearest-frame tolerance when a paw sample has no exact sensor row. */
const MAX_FRAME_GAP = 3

export function rayColorHex(depressionDeg: number): number {
  if (depressionDeg >= 55) return 0x44dd88
  if (depressionDeg >= 40) return 0xddaa44
  return 0xdd4444
}

interface SensorEntry {
  ts: number
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

/**
 * Camera position by paw-sample frame id. The paw CSV stamps `Time.frameCount`,
 * which matches `sensors.csv.gz` on 2 727 of 2 728 measured frames, so the
 * nearest-frame fallback is a rare path rather than the norm.
 */
export function buildCamLookup(
  sensorMap: Map<number, SensorEntry>,
): (frameId: number) => Vec3 | null {
  const frameIds = [...sensorMap.keys()].sort((a, b) => a - b)

  return (frameId: number) => {
    const exact = sensorMap.get(frameId)
    if (exact) return exact.pos
    if (frameIds.length === 0) return null

    let lo = 0
    let hi = frameIds.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (frameIds[mid] < frameId) lo = mid + 1
      else hi = mid
    }
    const candidates = [frameIds[lo], frameIds[Math.max(0, lo - 1)]]
    let best: number | null = null
    for (const c of candidates) {
      if (best === null || Math.abs(c - frameId) < Math.abs(best - frameId)) best = c
    }
    if (best === null || Math.abs(best - frameId) > MAX_FRAME_GAP) return null
    return sensorMap.get(best)!.pos
  }
}

export interface PawFloorAnalysis {
  quality: SessionQuality
  camFor: (frameId: number) => Vec3 | null
  focalPx: number
}

export function usePawFloorAnalysis(): PawFloorAnalysis | null {
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const sensorFrameMap = useSessionStore(s => s.sensorFrameMap)
  const intrinsics = useSessionStore(s => s.intrinsics)

  return useMemo(() => {
    if (!pawFloorFrameMap || pawFloorFrameMap.size === 0) return null
    if (!sensorFrameMap || sensorFrameMap.size === 0) return null

    const focalPx = intrinsics?.fx ?? 1357.7
    const camFor = buildCamLookup(sensorFrameMap)
    const quality = sessionQuality({ pawFrames: pawFloorFrameMap, camFor, focalPx })
    if (!quality) return null

    return { quality, camFor, focalPx }
  }, [pawFloorFrameMap, sensorFrameMap, intrinsics])
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- usePawFloorAnalysis`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the UI toggles**

In `src/stores/uiStore.ts`, add to the `UIState` interface next to `showARPlanes`:

```typescript
  showPawFloor: boolean
  showPawLift: boolean
```

to the actions block:

```typescript
  setShowPawFloor: (v: boolean) => void
  setShowPawLift: (v: boolean) => void
```

to `initialState`:

```typescript
  showPawFloor: true,
  showPawLift: false,
```

and to the store body:

```typescript
  setShowPawFloor: (v) => set({ showPawFloor: v }),
  setShowPawLift: (v) => set({ showPawLift: v }),
```

`showPawLift` defaults to `false` — the lift estimate is derived and must be opted into.

- [ ] **Step 6: Implement the scene component**

Create `src/three/environment/PawFloorProjection.tsx`:

```typescript
import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { usePawFloorAnalysis, rayColorHex } from '../../features/paw-floor/usePawFloorAnalysis'
import { rayGeometry, correctForLift } from '../../features/paw-floor/geometry'
import { fitSingleLift } from '../../features/paw-floor/lift'
import type { PawName, PawFloorFrame } from '../../types'
import type { PawPositions } from '../../features/paw-floor/stance'

const PAW_COLORS: Record<PawName, number> = {
  left_front_paw: 0x6699ff,
  right_front_paw: 0x66ddff,
  left_back_paw: 0xff9966,
  right_back_paw: 0xffcc66,
}

/** Trailing track window, in milliseconds. */
const TRACK_WINDOW_MS = 2000
/** Pixels of landmark error the hit disc is drawn to represent. */
const DISC_PIXELS = 10
/** Where a miss stub terminates along the screen ray, in metres. */
const MISS_STUB_M = 1.5

function nearestPawFrame(
  frames: Map<number, PawFloorFrame>,
  ts: number,
): { frameId: number; frame: PawFloorFrame } | null {
  let best: { frameId: number; frame: PawFloorFrame } | null = null
  let bestDelta = Infinity
  for (const [frameId, frame] of frames) {
    const delta = Math.abs(frame.ts - ts)
    if (delta < bestDelta) {
      bestDelta = delta
      best = { frameId, frame }
    }
  }
  return bestDelta <= 100 ? best : null
}

export function PawFloorProjection() {
  const showPawFloor = useUIStore(s => s.showPawFloor)
  const showPawLift = useUIStore(s => s.showPawLift)
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const analysis = usePawFloorAnalysis()

  return useMemo(() => {
    if (!showPawFloor || !analysis || !pawFloorFrameMap || frames.length === 0) return null

    const current = frames[frameIdx]
    if (!current) return null

    const match = nearestPawFrame(pawFloorFrameMap, current.ts)
    if (!match) return null

    const cam = analysis.camFor(match.frameId)
    if (!cam) return null

    const elements: ReactElement[] = []
    const positions: PawPositions = new Map()

    for (const [name, paw] of match.frame.paws) {
      const color = PAW_COLORS[name]

      if (!paw.hit || !paw.world) {
        // Miss stub: a dashed ray into the scene ending in a marker, so a
        // dropout reads as present-and-failed rather than silently absent.
        elements.push(
          <Line
            key={`miss-${name}`}
            points={[
              [cam.x, cam.y, cam.z],
              [cam.x, cam.y - MISS_STUB_M, cam.z],
            ]}
            color={color}
            lineWidth={1}
            dashed
            dashSize={0.03}
            gapSize={0.03}
            transparent
            opacity={0.35}
          />,
        )
        continue
      }

      positions.set(name, paw.world)
      const geom = rayGeometry(paw.world, cam, analysis.focalPx)
      if (!geom) continue

      elements.push(
        <Line
          key={`ray-${name}`}
          points={[
            [cam.x, cam.y, cam.z],
            [paw.world.x, paw.world.y, paw.world.z],
          ]}
          color={rayColorHex(geom.depressionDeg)}
          lineWidth={1.5}
          transparent
          opacity={Math.max(0.15, Math.min(1, paw.conf))}
        />,
      )

      // Hit disc sized to DISC_PIXELS of landmark error, drawn to scale.
      const radius = Math.max(0.005, geom.metresPerPixel * DISC_PIXELS)
      elements.push(
        <mesh
          key={`disc-${name}`}
          position={[paw.world.x, paw.world.y + 0.002, paw.world.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[radius, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>,
      )
    }

    // Trailing tracks over the last TRACK_WINDOW_MS.
    const trackPoints = new Map<PawName, Array<[number, number, number]>>()
    for (const [, frame] of pawFloorFrameMap) {
      if (frame.ts > current.ts || frame.ts < current.ts - TRACK_WINDOW_MS) continue
      for (const [name, paw] of frame.paws) {
        if (!paw.hit || !paw.world) continue
        if (!trackPoints.has(name)) trackPoints.set(name, [])
        trackPoints.get(name)!.push([paw.world.x, paw.world.y + 0.001, paw.world.z])
      }
    }
    for (const [name, points] of trackPoints) {
      if (points.length < 2) continue
      elements.push(
        <Line
          key={`track-${name}`}
          points={points}
          color={PAW_COLORS[name]}
          lineWidth={1}
          transparent
          opacity={0.4}
        />,
      )
    }

    // Derived lift stem, gated on the baseline and opted into explicitly.
    if (showPawLift && positions.size >= 2) {
      const fit = fitSingleLift(positions, cam, analysis.quality.baseline)
      if (fit) {
        const hit = positions.get(fit.paw)!
        const base = correctForLift(hit, cam, fit.liftM)
        elements.push(
          <Line
            key="lift-stem"
            points={[
              [base.x, hit.y, base.z],
              [base.x, hit.y + fit.liftM, base.z],
            ]}
            color={0xffffff}
            lineWidth={2}
            dashed
            dashSize={0.01}
            gapSize={0.01}
          />,
        )
      }
    }

    return elements.length > 0 ? <group>{elements}</group> : null
  }, [showPawFloor, showPawLift, analysis, pawFloorFrameMap, frames, frameIdx])
}
```

- [ ] **Step 7: Mount it in the canvas**

In `src/three/SceneCanvas.tsx`, add the import after the `ARPlanes` import on line 8:

```typescript
import { PawFloorProjection } from './environment/PawFloorProjection'
```

and add the element after `<ARPlanes />`:

```tsx
      <PawFloorProjection />
```

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — 188 tests in 31 files (181 + 7 new).

- [ ] **Step 10: Commit**

```bash
git add src/features/paw-floor/usePawFloorAnalysis.ts \
  src/features/paw-floor/__tests__/usePawFloorAnalysis.test.ts \
  src/three/environment/PawFloorProjection.tsx \
  src/stores/uiStore.ts src/three/SceneCanvas.tsx
git commit -m "Render paw floor projection rays, discs, tracks and gated lift"
```

---

### Task 8: Residual chords, plane drift tint, track fade

**Files:**
- Create: `src/features/paw-floor/visuals.ts`
- Create: `src/features/paw-floor/__tests__/visuals.test.ts`
- Modify: `src/three/environment/PawFloorProjection.tsx`

**Interfaces:**
- Consumes: `StanceBaseline`, `PawPositions` from Task 4; `PawFloorFrame` from Task 1.
- Produces:
  - `pairDeviationColorHex(observedM: number, baselineMedianM: number): number`
  - `trackOpacityForAge(ageMs: number, windowMs: number): number`
  - `planeMedianY(pawFrames: Map<number, PawFloorFrame>): number | null`
  - `planeDriftM(currentY: number, medianY: number): number`

**Deviation from the spec, stated deliberately.** The spec asked for the residual as "the
baseline stance quadrilateral ghosted against the actual". A faithful version needs a
Procrustes fit to place the ghost, and that fit has its own failure modes to explain.
Instead this draws **one chord per baseline pair, between the two actual paw positions,
coloured by how far that pair's observed distance deviates from its baseline median**.
No fitting step, and it shows *which* pair broke rather than only that something did.
Same information, fewer moving parts.

Thresholds: within 2 cm green (`0x44dd88`), 2–5 cm amber (`0xddaa44`), beyond 5 cm red
(`0xdd4444`) — matching the measured split between agreeing sessions (0.4–1.5 cm) and
disagreeing ones (7.9–8.5 cm).

- [ ] **Step 1: Write the failing test**

Create `src/features/paw-floor/__tests__/visuals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  pairDeviationColorHex,
  trackOpacityForAge,
  planeMedianY,
  planeDriftM,
} from '../visuals'
import type { PawFloorFrame } from '../../../types'

describe('pairDeviationColorHex', () => {
  it('is green when the pair matches its baseline', () => {
    expect(pairDeviationColorHex(0.170, 0.170)).toBe(0x44dd88)
    expect(pairDeviationColorHex(0.185, 0.170)).toBe(0x44dd88)
  })

  it('is amber for a 2-5 cm disagreement', () => {
    expect(pairDeviationColorHex(0.200, 0.170)).toBe(0xddaa44)
  })

  it('is red beyond 5 cm, in either direction', () => {
    expect(pairDeviationColorHex(0.250, 0.170)).toBe(0xdd4444)
    expect(pairDeviationColorHex(0.090, 0.170)).toBe(0xdd4444)
  })
})

describe('trackOpacityForAge', () => {
  it('is fully opaque at the current moment', () => {
    expect(trackOpacityForAge(0, 2000)).toBeCloseTo(1, 6)
  })

  it('fades to zero at the window edge', () => {
    expect(trackOpacityForAge(2000, 2000)).toBeCloseTo(0, 6)
  })

  it('is half way through the window', () => {
    expect(trackOpacityForAge(1000, 2000)).toBeCloseTo(0.5, 6)
  })

  it('clamps outside the window', () => {
    expect(trackOpacityForAge(5000, 2000)).toBe(0)
    expect(trackOpacityForAge(-10, 2000)).toBe(1)
  })
})

describe('planeMedianY and planeDriftM', () => {
  function framesWithYs(ys: number[]): Map<number, PawFloorFrame> {
    const frames = new Map<number, PawFloorFrame>()
    ys.forEach((y, i) => {
      const paws = new Map()
      paws.set('left_front_paw', {
        conf: 0.8, screenX: 0, screenY: 0, hit: true,
        planeId: 'A', world: { x: 0.8, y, z: 0 },
      })
      frames.set(i, { ts: i * 33, paws })
    })
    return frames
  }

  it('returns null with no hits', () => {
    expect(planeMedianY(new Map())).toBeNull()
  })

  it('takes the median plane height', () => {
    expect(planeMedianY(framesWithYs([-1.30, -1.32, -1.34]))!).toBeCloseTo(-1.32, 6)
  })

  it('measures absolute deviation from the median', () => {
    expect(planeDriftM(-1.35, -1.32)).toBeCloseTo(0.03, 6)
    expect(planeDriftM(-1.29, -1.32)).toBeCloseTo(0.03, 6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- visuals`
Expected: FAIL — cannot resolve `../visuals`.

- [ ] **Step 3: Implement**

Create `src/features/paw-floor/visuals.ts`:

```typescript
import type { PawFloorFrame } from '../../types'

/** Pair-distance deviation bands, in metres. */
const DEVIATION_GOOD_M = 0.02
const DEVIATION_WARN_M = 0.05

/** Plane height deviation past which the AR plane is tinted, in metres. */
export const PLANE_DRIFT_TINT_M = 0.01

export function pairDeviationColorHex(observedM: number, baselineMedianM: number): number {
  const deviation = Math.abs(observedM - baselineMedianM)
  if (deviation <= DEVIATION_GOOD_M) return 0x44dd88
  if (deviation <= DEVIATION_WARN_M) return 0xddaa44
  return 0xdd4444
}

/** Linear fade from 1 at the present to 0 at the trailing edge of the window. */
export function trackOpacityForAge(ageMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0
  const t = ageMs / windowMs
  if (t <= 0) return 1
  if (t >= 1) return 0
  return 1 - t
}

export function planeMedianY(pawFrames: Map<number, PawFloorFrame>): number | null {
  const ys: number[] = []
  for (const [, frame] of pawFrames) {
    for (const [, paw] of frame.paws) {
      if (paw.hit && paw.world) ys.push(paw.world.y)
    }
  }
  if (ys.length === 0) return null
  ys.sort((a, b) => a - b)
  return ys[Math.floor((ys.length - 1) / 2)]
}

export function planeDriftM(currentY: number, medianY: number): number {
  return Math.abs(currentY - medianY)
}
```

Note on `planeMedianY`: for an even-length list this takes the lower of the two middle
values rather than averaging them. That is intentional — plane heights are quantised to
the handful of values ARKit reports, and averaging would invent a height no plane ever had.

- [ ] **Step 4: Run the tests**

Run: `npm test -- visuals`
Expected: PASS, 10 tests.

- [ ] **Step 5: Draw the residual chords**

In `src/three/environment/PawFloorProjection.tsx`, add to the imports:

```typescript
import {
  pairDeviationColorHex,
  trackOpacityForAge,
  planeMedianY,
  planeDriftM,
  PLANE_DRIFT_TINT_M,
} from '../../features/paw-floor/visuals'
```

Then, immediately before the `showPawLift` block, add:

```typescript
    // One chord per baseline pair, coloured by that pair's disagreement with
    // its session median. Shows which pair broke, not merely that one did.
    for (const stat of analysis.quality.baseline.pairs) {
      const a = positions.get(stat.pair[0])
      const b = positions.get(stat.pair[1])
      if (!a || !b) continue
      const observed = Math.hypot(a.x - b.x, a.z - b.z)
      elements.push(
        <Line
          key={`chord-${stat.pair[0]}-${stat.pair[1]}`}
          points={[
            [a.x, a.y + 0.003, a.z],
            [b.x, b.y + 0.003, b.z],
          ]}
          color={pairDeviationColorHex(observed, stat.median)}
          lineWidth={1}
          transparent
          opacity={0.55}
        />,
      )
    }
```

- [ ] **Step 6: Fade the tracks**

Replace the trailing-track block (the `trackPoints` loop and the `Line` it emits) with a
version that emits one segment per step so opacity can vary with age:

```typescript
    const trackPoints = new Map<PawName, Array<{ p: [number, number, number]; ts: number }>>()
    for (const [, frame] of pawFloorFrameMap) {
      if (frame.ts > current.ts || frame.ts < current.ts - TRACK_WINDOW_MS) continue
      for (const [name, paw] of frame.paws) {
        if (!paw.hit || !paw.world) continue
        if (!trackPoints.has(name)) trackPoints.set(name, [])
        trackPoints.get(name)!.push({
          p: [paw.world.x, paw.world.y + 0.001, paw.world.z],
          ts: frame.ts,
        })
      }
    }
    for (const [name, samples] of trackPoints) {
      samples.sort((m, n) => m.ts - n.ts)
      for (let i = 1; i < samples.length; i++) {
        const opacity = trackOpacityForAge(current.ts - samples[i].ts, TRACK_WINDOW_MS)
        if (opacity <= 0.02) continue
        elements.push(
          <Line
            key={`track-${name}-${i}`}
            points={[samples[i - 1].p, samples[i].p]}
            color={PAW_COLORS[name]}
            lineWidth={1}
            transparent
            opacity={opacity * 0.6}
          />,
        )
      }
    }
```

- [ ] **Step 7: Tint on plane drift**

Add, after the chord block:

```typescript
    // A disc under the stance turns amber when the plane the hits are resolving
    // against has moved from where it sat for most of the session.
    const medianY = planeMedianY(pawFloorFrameMap)
    const currentY = [...positions.values()][0]?.y
    if (medianY !== null && currentY !== undefined) {
      const drift = planeDriftM(currentY, medianY)
      if (drift > PLANE_DRIFT_TINT_M) {
        elements.push(
          <mesh
            key="plane-drift"
            position={[cam.x, currentY + 0.0005, cam.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[1.2, 1.35, 48]} />
            <meshBasicMaterial color={0xddaa44} transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>,
        )
      }
    }
```

- [ ] **Step 8: Typecheck, lint, full suite**

Run: `npx tsc -b --noEmit && npm run lint && npm test`
Expected: no errors; 198 tests in 32 files (188 + 10 new).

- [ ] **Step 9: Commit**

```bash
git add src/features/paw-floor/visuals.ts \
  src/features/paw-floor/__tests__/visuals.test.ts \
  src/three/environment/PawFloorProjection.tsx
git commit -m "Add residual chords, track fade and plane drift tint"
```

---

### Task 9: HUD verdict panel

**Files:**
- Create: `src/features/file-ingest/fixtures/paw-floor-sensor-sample.csv`
- Create: `src/components/PawFloorVerdict.tsx`
- Modify: `src/components/HUD.tsx` (render the new component)
- Create: `src/components/__tests__/PawFloorVerdict.test.tsx`

**Interfaces:**
- Consumes: `usePawFloorAnalysis` from Task 7.
- Produces: `PawFloorVerdict` component. Renders `null` when no paw data is loaded.

`HUD.tsx` returns `null` early when `frames.length === 0` (line 20), so the verdict is mounted inside the HUD's own markup and inherits that guard.

The existing `sensor-sample.csv` fixture uses frame ids 1, 2, 3, which do not overlap the
paw fixture's 5138 / 5172 / 5175. Reusing it would leave `camFor` returning null for every
sample, so no ray geometry would be computed and the panel would render `NaN°`. This task
adds a matching sensor fixture so the verdict is exercised with real geometry.

- [ ] **Step 1: Create the matching sensor fixture**

Create `src/features/file-ingest/fixtures/paw-floor-sensor-sample.csv`. Frame ids line up
with `paw-floor-sample.csv`; the camera sits ~1.34 m above the plane the paw hits resolve
to (`world_y ≈ -1.32`), matching a phone held at chest height.

```
frame_id,timestamp_ms,cam_pos_x,cam_pos_y,cam_pos_z,cam_rot_x,cam_rot_y,cam_rot_z,cam_rot_w
5138,3001,0.0,0.0200,0.0,0.0,0.0,0.0,1.0
5172,3584,0.0100,0.0210,0.0050,0.0,0.0,0.0,1.0
5175,3634,0.0110,0.0205,0.0055,0.0,0.0,0.0,1.0
5178,3668,0.0120,0.0200,0.0060,0.0,0.0,0.0,1.0
```

- [ ] **Step 2: Write the failing test**

Create `src/components/__tests__/PawFloorVerdict.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PawFloorVerdict } from '../PawFloorVerdict'
import { useSessionStore } from '../../stores/sessionStore'
import { ingestText } from '../../features/file-ingest/ingest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pawFixture = readFileSync(
  join(__dirname, '../../features/file-ingest/fixtures/paw-floor-sample.csv'),
  'utf-8',
)
const sensorFixture = readFileSync(
  join(__dirname, '../../features/file-ingest/fixtures/paw-floor-sensor-sample.csv'),
  'utf-8',
)

describe('PawFloorVerdict', () => {
  beforeEach(() => {
    useSessionStore.getState().reset()
  })

  it('renders nothing without paw data', () => {
    const { container } = render(<PawFloorVerdict />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with paw data but no sensor data', () => {
    ingestText(pawFixture, 'paw_floor.csv')
    const { container } = render(<PawFloorVerdict />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a verdict once paw and sensor data are both present', () => {
    ingestText(sensorFixture, 'sensors.csv')
    ingestText(pawFixture, 'paw_floor.csv')
    render(<PawFloorVerdict />)
    expect(screen.getByTestId('paw-floor-verdict')).toBeInTheDocument()
  })

  it('never presents a paw depth reading', () => {
    ingestText(sensorFixture, 'sensors.csv')
    ingestText(pawFixture, 'paw_floor.csv')
    const { container } = render(<PawFloorVerdict />)
    expect(container.textContent).not.toMatch(/paw depth/i)
  })

  it('renders real angles, never NaN', () => {
    ingestText(sensorFixture, 'sensors.csv')
    ingestText(pawFixture, 'paw_floor.csv')
    const { container } = render(<PawFloorVerdict />)
    expect(container.textContent).not.toMatch(/NaN/)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- PawFloorVerdict`
Expected: FAIL — cannot resolve `../PawFloorVerdict`.

- [ ] **Step 4: Implement**

Create `src/components/PawFloorVerdict.tsx`:

```typescript
import { usePawFloorAnalysis } from '../features/paw-floor/usePawFloorAnalysis'
import type { PawName } from '../types'

const VERDICT_COLOR: Record<string, string> = {
  TRUSTWORTHY: '#44dd88',
  DEGRADED: '#ddaa44',
  UNRELIABLE: '#dd4444',
}

const PAW_LABEL: Record<PawName, string> = {
  left_front_paw: 'LF',
  right_front_paw: 'RF',
  left_back_paw: 'LB',
  right_back_paw: 'RB',
}

export function PawFloorVerdict() {
  const analysis = usePawFloorAnalysis()
  if (!analysis) return null

  const q = analysis.quality
  const counts = (Object.entries(q.pawCounts) as Array<[PawName, number]>)
    .map(([name, n]) => `${PAW_LABEL[name]} ${n}`)
    .join('  ')

  // Depression percentiles are NaN when no paw sample could be matched to a
  // camera pose. Show that as unknown rather than printing "NaN°".
  const deg = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}°` : 'n/a')

  return (
    <div data-testid="paw-floor-verdict" style={{ marginTop: 8, lineHeight: 1.5 }}>
      <div>
        <strong>paw floor projection</strong>{' '}
        <span style={{ color: VERDICT_COLOR[q.verdict] ?? '#ccc' }}>{q.verdict}</span>
      </div>
      <div>
        hits {(q.hitRate * 100).toFixed(0)}% of {q.sampleCount} &middot;{' '}
        depression p5 {deg(q.depressionP5)} / p50 {deg(q.depressionP50)}
      </div>
      <div>
        plane span {(q.planeYSpanM * 100).toFixed(1)} cm across {q.planeCount} plane
        {q.planeCount === 1 ? '' : 's'} &middot;{' '}
        residual p50{' '}
        {Number.isFinite(q.residualP50M) ? `${(q.residualP50M * 100).toFixed(1)} cm` : 'n/a'}
      </div>
      <div>{counts}</div>
      <div>
        stance baseline {q.baseline.qualified ? 'stable' : 'loose'} ({q.baseline.pairs.length} pairs)
        {q.baseline.qualified ? '' : ' — lift estimate unavailable'}
      </div>
      {q.reasons.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: '#bbb' }}>
          {q.reasons.map(r => <li key={r}>{r}</li>)}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Mount it in the HUD**

In `src/components/HUD.tsx`, add the import at the top:

```typescript
import { PawFloorVerdict } from './PawFloorVerdict'
```

and render `<PawFloorVerdict />` as the last child inside the HUD's outermost returned element.

- [ ] **Step 6: Run the tests**

Run: `npm test -- PawFloorVerdict`
Expected: PASS, 5 tests.

- [ ] **Step 7: Typecheck, lint, full suite**

Run: `npx tsc -b --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 203 tests in 33 files (198 + 5 new).

- [ ] **Step 8: Verify against a real bundle**

Run `npm run dev`, open the viewer, and drag in all files from one bundle directory. Check with two contrasting sessions:

- `20260731-011003-ec14` — expect **TRUSTWORTHY**, tight hit discs, mostly green rays, and the lift toggle available.
- `20260731-010534-dd26` — expect **UNRELIABLE** citing 2 planes, and "stance baseline loose — lift estimate unavailable".

- [ ] **Step 9: Commit**

```bash
git add src/components/PawFloorVerdict.tsx src/components/HUD.tsx \
  src/components/__tests__/PawFloorVerdict.test.tsx \
  src/features/file-ingest/fixtures/paw-floor-sensor-sample.csv
git commit -m "Add paw floor projection verdict panel to the HUD"
```

---

## Deferred

Carried over from the spec, deliberately not in this plan:

- Timeline quality ribbon (per-paw presence lanes plus a residual sparkline).
- Video-overlay rendering of the projection.
- Removing or repurposing `paw_depth_m` in the `unity-game` recorder — it touches the bundle contract across three repos and needs its own decision.
