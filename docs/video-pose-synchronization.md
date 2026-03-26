# Session Viewer — Video & Pose Synchronization

How the web viewer replays sessions and keeps the MP4 video frame-accurate with landmark overlay data.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Recording Side: One Clock, One Epoch](#recording-side-one-clock-one-epoch)
3. [Data Formats Written](#data-formats-written)
4. [Playback Side: Reconstructing Sync](#playback-side-reconstructing-sync)
5. [The PlaybackEngine Loop](#the-playbackengine-loop)
6. [Video Time Conversion](#video-time-conversion)
7. [Pose Lookup Algorithm](#pose-lookup-algorithm)
8. [Video Seek & Frame Extraction](#video-seek--frame-extraction)
9. [Skeleton Rendering Pipeline](#skeleton-rendering-pipeline)
10. [Why It's Pixel-Perfect](#why-its-pixel-perfect)
11. [Edge Cases Handled](#edge-cases-handled)
12. [The skelMsOffset Escape Hatch](#the-skelmsoffset-escape-hatch)

---

## Architecture Overview

All session data streams (video, pose landmarks, sensor/camera, audio, game events) share a **single clock source**: the ARKit boot-time clock. A **single epoch** (the first camera frame's boot-time) is subtracted from all timestamps so every stream starts at ~0. The viewer reconstructs sync by using sensor timestamps as the primary timeline, binary-searching pose data by timestamp, and seeking the HTML5 video element to the matching PTS.

```
ARKit camera frame (boot-time T)
    |
    +---> VideoCapture: PTS = (T - sessionStart) * 1e9 ns  --> MP4
    +---> VisionBridge: inference on same frame, callback with timestamp = T
    |         +---> PoseDataRecorder: CSV row ts = (T*1000 - sessionStart*1000) ms
    +---> SensorRecorder: CSV row ts = (interpolated_boot - sessionStart) * 1000 ms
    +---> AudioCapture: PTS = CMTimeSubtract(mic_boot_PTS, sessionStart)  --> M4A
```

---

## Recording Side: One Clock, One Epoch

### Step 1 — Establishing the session epoch

When the first ARKit camera frame arrives (`SessionRecorder.cs:134`):

```csharp
_sessionStartBootTime = image.timestamp;  // ARKit boot-time in seconds
```

This value becomes the **zero point** for the entire session. It's communicated to three systems simultaneously:

| System | How it receives the epoch |
|---|---|
| **Video writer** | `VideoCapture.SetSessionStartTime((long)(_sessionStartBootTime * 1e9))` — stored as `_sessionStartBootTimeNs` in native ObjC |
| **Pose recorder** | `_poseRecorder.TimestampOffsetMs = (long)(_sessionStartBootTime * 1000.0)` — subtracted from each pose's boot-time ms |
| **Sensor recorder** | Computed inline each frame: `sensorMs = (sensorBootTime - _sessionStartBootTime) * 1000.0` |

### Step 2 — Video frame PTS (the MP4 timeline)

Each ARKit camera frame's timestamp is converted to session-relative nanoseconds (`SessionRecorder.cs:141`):

```csharp
long sessionPtsNs = (long)((image.timestamp - _sessionStartBootTime) * 1e9);
```

This `sessionPtsNs` is passed directly to the native `VideoCapture_AppendBGRAFrame()`. In `VideoCapture.mm:253`:

```objc
CMTime pts = CMTimeMake(timestampNs, 1000000000);  // ns -> CMTime
```

The AVAssetWriter session starts at `kCMTimeZero` (line 276), so the MP4's internal timeline starts at 0 and each frame's PTS is the exact session-relative offset. **There is no edit list (elst) that would shift time.**

### Step 3 — Pose frame timestamps

The pose inference callback in `VisionBridge.mm:377` captures:

```objc
double frameTimestamp = frame.timestamp;  // ARKit boot-time seconds
```

This is the **same `image.timestamp`** from the ARKit camera frame that was also used for the video PTS. The Vision framework processes the same pixel buffer, so the timestamp is identical to the video frame's source timestamp.

On the C# side (`AppleVisionProvider.cs:682`):

```csharp
TimestampMs = (long)(frameTimestamp * 1000.0)  // boot-time ms
```

When written to CSV, the `PoseDataRecorder` subtracts the epoch (`PoseDataRecorder.cs:70`):

```csharp
$"{f.TimestampMs - tsOffset}"  // session-relative ms
```

### Step 4 — Sensor frame timestamps

In `SessionRecorder.Update()` (lines 257-258):

```csharp
double sensorBootTime = _latestFrameBootTime
    + (Time.realtimeSinceStartupAsDouble - _latestFrameUnityTime);
long sensorMs = (long)((sensorBootTime - _sessionStartBootTime) * 1000.0);
```

This interpolates between ARKit camera frame arrivals using Unity's realtime clock, keeping sensor rows aligned to the same session-relative timeline.

### Result: All timestamps are session-relative from the same origin

```
Video PTS:    (ARKit_frame.timestamp - sessionStart) * 1e9   -> nanoseconds in MP4
Pose CSV:     (ARKit_frame.timestamp * 1000) - (sessionStart * 1000) -> ms in CSV
Sensor CSV:   (interpolated_boot_time - sessionStart) * 1000 -> ms in CSV
Audio PTS:    CMTimeSubtract(mic_boot_PTS, sessionStart_CMTime) -> session-relative in M4A
```

---

## Data Formats Written

### Pose CSV (`pose_landmarks.csv.gz`)

```
timestamp_ms, frame_id, model_id, model_version, landmark, x, y, confidence, depth_m
```

- Multiple rows per frame (one per landmark per model)
- `x, y`: normalized 0-1 in image space (landscape Vision framework coordinates)
- `timestamp_ms`: session-relative milliseconds
- `depth_m`: meters from camera (optional, may be empty)

### Sensor CSV (`sensors.csv.gz`)

```
timestamp_ms, frame_id, cam_pos_x, cam_pos_y, cam_pos_z,
cam_rot_x, cam_rot_y, cam_rot_z, cam_rot_w,
accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z,
gyro_att_x, gyro_att_y, gyro_att_z, gyro_att_w,
light_intensity, light_temp_k
```

- One row per Unity `Update()` frame
- `cam_rot_*`: quaternion orientation
- `timestamp_ms`: session-relative milliseconds (interpolated from ARKit clock)

### Video (`session.mp4`)

- H.264 encoded, 960x720 BGRA source
- 90-degree rotation transform applied (`M_PI_2`) for portrait display
- PTS in session-relative nanoseconds, session starts at `kCMTimeZero`
- No edit list — `video.currentTime = 0` maps to the first frame's PTS

### Audio (`session_audio.m4a`)

- Separate file (not muxed with video)
- AAC mono 44.1kHz
- PTS offset from boot-time to session-relative, matching video timeline

### Session metadata (`session_meta.json`)

- Contains camera intrinsics: `focalLengthX/Y`, `principalPointX/Y`, `cameraResW/H`
- Scene ID, device ID, session ID
- Model list with versions

---

## Playback Side: Reconstructing Sync

### Data Ingestion (`features/file-ingest/`)

Files routed by extension in `ingestFile()`:

| Extension | Handler |
|---|---|
| `.mp4` / `.mov` | `URL.createObjectURL()` -> `sessionStore.setVideoUrl()` |
| `.m4a` | `URL.createObjectURL()` -> `sessionStore.setAudioUrl()` |
| `.gz` | Decompress via `DecompressionStream('gzip')`, strip `.gz`, re-route |
| `.csv` | Header detection: `landmark` + `model_id` -> pose parser; `cam_pos_x` + `cam_rot_x` -> sensor parser |
| `.json` | Shape detection: `.events[]` -> game events; `.planes[]` -> AR planes; `focalLengthX` -> metadata + intrinsics |

### Timeline Construction (`rebuildFrameList()` in `frame-utils.ts`)

1. **Primary timeline**: sensor data (ARKit camera frames) if available; pose data as fallback
2. **Filter**: discard epoch timestamps (`> 1e12 ms`) when boot-relative timestamps exist
3. **Sort** by timestamp ascending
4. **Build `frames[]`**: `{ id, ts, sensor }` — the canonical playback timeline
5. **Build `poseEvents[]`**: sorted pose frames for binary-search lookup

### Store Architecture (Zustand)

- **`sessionStore`**: parsed data (frames, poseEvents, models, intrinsics, events, video URLs)
- **`playbackStore`**: playback state (currentFrameIdx, isPlaying, playbackSpeed)
- **`uiStore`**: rendering settings (skeleton visibility, confidence threshold, skelMsOffset, videoAlpha)

---

## The PlaybackEngine Loop

`PlaybackEngine.tsx` runs inside the React Three Fiber canvas via `useFrame()`.

### Frame advancement (fixed-step accumulator)

```typescript
// Compute uniform frame duration from total timespan
frameDuration = (frames[last].ts - frames[0].ts) / (frames.length - 1)
// Fallback: 33.33ms (~30fps) if only 1 frame

// Each render tick:
accumulator += deltaMs * playbackSpeed

while (accumulator >= frameDuration && idx < frames.length - 1) {
    accumulator -= frameDuration
    idx++
}

if (idx !== currentFrameIdx) {
    setFrameIdx(idx)       // update store
    seekToFrame(idx)       // sync video + audio
}

if (idx >= frames.length - 1) {
    pause()                // auto-stop at end
}
```

This is a **uniform-step simulation**: each frame gets equal time regardless of actual timestamp jitter. The accumulator prevents drift across variable render frame rates.

### Play/pause transitions

- Subscribes to `playbackStore` state changes
- Resets accumulator to 0 on play start (no carryover from previous pause)
- Calls `syncAudioPlayback()` to start/stop the audio element

---

## Video Time Conversion

`videoTimeForFrame()` in `useVideoSync.ts` bridges frame timestamps to video seconds:

```typescript
function videoTimeForFrame(frames, frameIdx, videoT0Ref) {
    // On first call, find first frame with ts > 0
    if (videoT0Ref.current === null) {
        for (const f of frames) {
            if (f.ts > 0) { videoT0Ref.current = f.ts; break }
        }
        // Session-relative (< 5 min) -> offset = 0
        // Boot-relative (>= 5 min)   -> offset = first timestamp
        if (videoT0Ref.current < 300_000) videoT0Ref.current = 0
    }

    return Math.max(0, (frames[frameIdx].ts - videoT0Ref.current) / 1000)
}
```

Since recording now produces session-relative timestamps starting near 0 (e.g., ~200ms due to warmup skip), `videoT0Ref` will be small, so `offset = 0`. The video seconds are `frames[frameIdx].ts / 1000`, which matches the MP4's PTS directly because both were computed as `(bootTime - sessionStart)`.

The **300,000ms (5 min) threshold** distinguishes session-relative timestamps (starting near 0) from legacy boot-relative timestamps (starting at millions of ms).

---

## Pose Lookup Algorithm

`findNearestPoseModels()` in `frame-utils.ts`:

```typescript
const MAX_POSE_GAP_MS = 100  // ~3 frames at 30fps

function findNearestPoseModels(poseEvents, targetTs) {
    if (poseEvents.length === 0) return new Map()

    // Binary search for insertion point
    let lo = 0, hi = poseEvents.length - 1
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (poseEvents[mid].ts < targetTs) lo = mid + 1
        else hi = mid
    }

    // Check if previous entry is actually closer
    if (lo > 0 &&
        Math.abs(poseEvents[lo - 1].ts - targetTs) <=
        Math.abs(poseEvents[lo].ts - targetTs)) {
        lo--
    }

    // Staleness check: reject if gap > 100ms
    if (Math.abs(poseEvents[lo].ts - targetTs) > MAX_POSE_GAP_MS)
        return new Map()

    return poseEvents[lo].models
}
```

- **Binary search** finds the closest pose event by timestamp
- **100ms gap tolerance**: if the nearest pose is >100ms away, returns empty (no skeleton drawn)
- Handles sparse pose data (inference doesn't run every frame)

---

## Video Seek & Frame Extraction

`seekToFrame()` in `useVideoSync.ts`:

```typescript
const seekToFrame = (frameIdx) => {
    const t = videoTimeForFrame(frames, frameIdx, videoT0Ref)

    // For each media element (RGB video, depth video, audio):
    if (Math.abs(element.currentTime - t) < 0.001) {
        drawFrame()  // already at target (1ms tolerance), draw immediately
    } else {
        element.currentTime = t  // browser seeks, 'seeked' event triggers draw
    }
}
```

### Frame extraction to canvas

On each seek completion (or immediate draw):

1. `ctx.drawImage(videoEl, 0, 0, w, h)` copies decoded video frame to offscreen `<canvas>`
2. `ctx.getImageData()` extracts pixel data into `rgbFrameRef` (or `depthFrameRef`)
3. The Three.js `Frustum` component reads `rgbFrameRef` each render tick and updates a `CanvasTexture`

### Video element setup

- Hidden `<video>` element, `muted = true`, `playsInline = true`
- Canvas sized to match `videoWidth x videoHeight` on `loadedmetadata`
- `seeked` event listener triggers `drawRgbFrame()` / `drawDepthFrame()`
- Separate `<audio>` element for playback with `playbackRate = speed`, `volume = 0.5`

### 1ms tolerance

The `Math.abs(currentTime - t) < 0.001` check avoids redundant browser seeks during frame-by-frame scrubbing and prevents seek thrashing.

---

## Skeleton Rendering Pipeline

### Data flow

```
currentFrameIdx (playbackStore)
    |
    v
frames[frameIdx] -> get Frame with { ts, sensor }
    |
    v
targetTs = frame.ts + skelMsOffset
    |
    v
findNearestPoseModels(poseEvents, targetTs)
    |
    v
Map<modelId, Map<jointName, Landmark>>
    |
    +---> Skeleton2D: unproject to frustum plane (2D overlay on video)
    +---> Skeleton3D: unproject to world space (3D reconstruction)
```

### Skeleton2D (video overlay)

- Places landmarks on the frustum plane at `depth = 0.3 * 0.98 = 0.294m` (just in front of video texture at 0.3m)
- Uses `unproject(nx, ny, frustumDepth, sensor, intrinsics)` with landscape-to-portrait intrinsics swap
- Joints scaled to 40% of 3D size: `scale = (0.6 + 0.4 * conf) * 0.4`
- Opacity = `videoAlpha` (default 0.8)
- Bone line width = 4px
- Confidence filtering: skips landmarks below `confidenceThreshold` (default 0.3)

### Skeleton3D (world space)

- Uses actual `landmark.depth` for Z; falls back to **median depth** of all valid landmarks in the frame
- Full-size joints: `scale = 0.6 + 0.4 * conf`
- Opacity = `0.3 + 0.7 * avgConfidence`
- Bone line width = 3px

### `unproject()` coordinate transform

1. **Landscape to portrait intrinsics swap** (Vision framework delivers landscape coords, camera intrinsics are portrait)
2. **Camera-space unprojection**: `lx = -(px - pcx)/pfx * depth`, `ly = (py - pcy)/pfy * depth`, `lz = depth`
3. **Quaternion rotation**: apply camera orientation (`q * v * q^-1`)
4. **Translate** by camera position

### Frustum (video texture plane)

- `Frustum.tsx` renders a textured plane at `frustumD * 0.99 = 0.297m` from the camera group
- Each `useFrame()` tick: reads `rgbFrameRef.canvas`, draws mirrored (x-flip for rotation correction), updates `CanvasTexture`
- Camera group is positioned/rotated to match `frame.sensor` (pos + quaternion)

---

## Why It's Pixel-Perfect

There are **not two independent clocks being correlated** — there is **one clock sampled at one moment**:

1. ARKit delivers a camera frame with `timestamp = T` (boot-time seconds)
2. That **same frame** is sent to:
   - `VideoCapture_AppendBGRAFrame()` with PTS = `(T - sessionStart) * 1e9`
   - `VisionBridge` which runs inference and calls back with `frameTimestamp = T`
3. The pose recorder writes `(T * 1000 - sessionStart * 1000)` ms
4. The video writer writes a frame at `(T - sessionStart)` seconds

So when the viewer seeks video to time `X` seconds and looks up pose at time `X * 1000` ms, it finds the **exact same ARKit frame's data** because both values derive from the same `T`.

---

## Edge Cases Handled

| Edge case | How it's handled |
|---|---|
| **Pose arrives late** (async Vision inference) | Pose `frameTimestamp` is the ARKit frame's timestamp, not the wall-clock time inference completed. It matches the video frame that was analyzed. |
| **Sensor runs at different rate than camera** | Sensor timestamps are interpolated from the latest camera frame's boot-time, staying within ~16ms of the true ARKit clock. |
| **Non-monotonic video PTS** | Native code nudges forward by 1ms to keep H.264 encoder happy (`VideoCapture.mm:259`). |
| **First 200ms of frames skipped** | Both video and sensor skip frames with `sessionPtsNs < 200_000_000L` to avoid stale post-restart pixels. |
| **Sparse pose data** | `findNearestPoseModels()` binary search + 100ms gap tolerance ensures no stale skeleton is shown. |
| **Legacy boot-relative timestamps** | `videoTimeForFrame()` detects via 300s threshold and subtracts the first timestamp. |
| **Video already at target time** | 1ms tolerance check avoids redundant browser seeks. |
| **Stale CPU image** | `SessionRecorder.cs:124` checks `|image.timestamp - frame.timestamp| > 100ms` and skips. |
| **Video writer failure** | `_videoWriterFailed` flag prevents further append attempts; logged but doesn't crash. |
| **Audio before session start** | Audio delegate drops samples with `sessionPTS < 0`. |

---

## The skelMsOffset Escape Hatch

The UI exposes `skelMsOffset` (default 0) in `uiStore`, which shifts the pose lookup timestamp:

```typescript
const targetTs = frame.ts + skelMsOffset
```

This lets the user manually correct any systematic offset between pose data and video. With the current architecture — where pose timestamps come from the ARKit frame (not inference completion time) — it's typically unnecessary, but serves as a diagnostic tool when investigating sync issues.

---

## Key Source Files

| File | Role |
|---|---|
| `SessionRecorder.cs` | Recording orchestrator, epoch establishment, clock interpolation |
| `PoseDataRecorder.cs` | Pose CSV writer with epoch subtraction |
| `SensorRecorder.cs` | Sensor CSV writer with interpolated timestamps |
| `VideoCapture.mm` | Native H.264 writer with session-relative PTS |
| `VisionBridge.mm` | Native pose inference, passes ARKit frame timestamp |
| `features/viewer/PlaybackEngine.tsx` | Fixed-step frame advancement loop |
| `features/viewer/useVideoSync.ts` | Video element management, timestamp conversion, seeking |
| `features/viewer/frame-utils.ts` | Timeline construction, binary-search pose lookup |
| `stores/playbackStore.ts` | Playback state (frame index, play/pause, speed) |
| `stores/sessionStore.ts` | Parsed session data (frames, poses, intrinsics, events) |
| `stores/uiStore.ts` | UI settings (skeleton visibility, confidence, offset) |
| `three/skeleton/Skeleton2D.tsx` | 2D skeleton overlay on frustum plane |
| `three/skeleton/Skeleton3D.tsx` | 3D world-space skeleton |
| `three/environment/Frustum.tsx` | Video texture plane + camera group positioning |
| `features/viewer/unproject.ts` | Image-space to world-space coordinate transform |
