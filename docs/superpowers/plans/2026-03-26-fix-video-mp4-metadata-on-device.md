# Fix Video MP4 Metadata On-Device

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the broken MP4 edit list and low-precision timebase produced by AVAssetWriter so that Unity's VideoPlayer can seek correctly without a post-recording ffmpeg remux.

**Architecture:** Two changes in each native capture file: (1) use a video-friendly timescale (19200) instead of nanoseconds (1e9) so AVAssetWriter doesn't remap to its lossy internal 600, and (2) call `startSessionAtSourceTime:` with the first frame's actual PTS instead of `kCMTimeZero`, eliminating the gap that generates the edit list. Video PTS remains session-relative (~200ms onward) to stay aligned with sensor/pose CSVs and audio.

**Tech Stack:** Objective-C, AVFoundation (AVAssetWriter), CMTime

---

## Root Cause

`SessionRecorder.cs` skips the first 200ms of camera frames (stale pixels after AR restart) then sends session-relative PTS starting at ~200ms to the native layer. The native layer calls `startSessionAtSourceTime:kCMTimeZero` but the first actual frame arrives at ~200ms, creating a 200ms gap. Combined with the nanosecond timescale (`CMTimeMake(timestampNs, 1000000000)`), AVAssetWriter:

1. **Remaps the timescale** from 1e9 → 600 (its internal default), losing precision
2. **Generates an `elst` (edit list)** to bridge the 200ms gap between session start (0) and first frame PTS
3. **Sets `start_pts` = 120** (0.200s at timescale 600) instead of 0

Unity's VideoPlayer doesn't handle edit lists properly, so seeking breaks.

**Why not zero-base?** All data sources (video, audio, sensors, poses) share a session-relative timeline starting from `_sessionStartBootTime`. The 200ms skip is intentional — those frames are frozen. Rebasing video PTS to 0 would desync video from CSV/audio timestamps. Instead, we start the MP4 session at the first frame's actual PTS so there's no gap for AVAssetWriter to bridge with an edit list.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `Assets/Plugins/iOS/SessionCapture/VideoCapture.mm` | RGB video — fix timescale + start session at first frame PTS |
| Modify | `Assets/Plugins/iOS/SessionCapture/DepthVideoCapture.mm` | Depth video — same fix |

No new files. No C# changes. No interface changes.

---

### Task 1: Fix timescale and session start in VideoCapture.mm

**Files:**
- Modify: `Assets/Plugins/iOS/SessionCapture/VideoCapture.mm`
  - Lines 12-21: add timescale constant
  - Lines 253-263: change PTS computation to use new timescale
  - Lines 272-279: start session at first frame PTS instead of kCMTimeZero

The existing comment on line 274 says "Using `pts` here would create an MP4 edit list" — this is actually backwards. Using `kCMTimeZero` creates the edit list because it introduces a gap. Using `pts` (the first frame's actual PTS) eliminates the gap.

- [ ] **Step 1: Add the video timescale constant**

At the top of the file, after line 21 (`static CMTime _lastVideoPTS;`), add:

```objc
static const int32_t kVideoTimescale = 19200; // LCM-friendly for 24/30/60fps — prevents AVAssetWriter remap to 600
```

- [ ] **Step 2: Change PTS computation in VideoCapture_AppendBGRAFrame**

Replace lines 253-263:

```objc
    CMTime pts = CMTimeMake(timestampNs, 1000000000);

    // Enforce strictly monotonic PTS — the H.264 encoder will hard-fail on
    // duplicate or backwards timestamps (produces opaque OSStatus errors).
    if (CMTIME_IS_VALID(_lastVideoPTS) && CMTimeCompare(pts, _lastVideoPTS) <= 0) {
        // Nudge forward by 1ms past last PTS to keep the stream alive.
        pts = CMTimeAdd(_lastVideoPTS, CMTimeMake(1, 1000));
        if (_frameCount < 10 || _frameCount % 100 == 0)
            NSLog(@"[BR] VideoWriter: non-monotonic PTS at frame #%d, nudged to %.3fs",
                  _frameCount, CMTimeGetSeconds(pts));
    }
```

With:

```objc
    // Convert nanoseconds → video timescale (19200).
    // A standard timescale prevents AVAssetWriter from remapping to its
    // internal default (600) which destroys frame-level precision.
    int64_t ticks = (int64_t)((double)timestampNs / 1e9 * kVideoTimescale);
    CMTime pts = CMTimeMake(ticks, kVideoTimescale);

    // Enforce strictly monotonic PTS — the H.264 encoder will hard-fail on
    // duplicate or backwards timestamps (produces opaque OSStatus errors).
    if (CMTIME_IS_VALID(_lastVideoPTS) && CMTimeCompare(pts, _lastVideoPTS) <= 0) {
        // Nudge forward by 1 tick past last PTS to keep the stream alive.
        pts = CMTimeAdd(_lastVideoPTS, CMTimeMake(1, kVideoTimescale));
        if (_frameCount < 10 || _frameCount % 100 == 0)
            NSLog(@"[BR] VideoWriter: non-monotonic PTS at frame #%d, nudged to %.3fs",
                  _frameCount, CMTimeGetSeconds(pts));
    }
```

- [ ] **Step 3: Start session at first frame's PTS instead of kCMTimeZero**

Replace lines 272-279:

```objc
    if (!_videoSessionStarted) {
        // Start at time zero so the media timeline matches our session-relative PTS.
        // Using `pts` here would create an MP4 edit list (elst) that shifts
        // video.currentTime=0 to the first frame's PTS, breaking viewer sync.
        [_videoWriter startSessionAtSourceTime:kCMTimeZero];
        _videoSessionStarted = YES;
        NSLog(@"[BR] VideoWriter session started (first frame pts=%.3fs)", CMTimeGetSeconds(pts));
    }
```

With:

```objc
    if (!_videoSessionStarted) {
        // Start the session at the first frame's actual PTS (session-relative ~200ms)
        // instead of kCMTimeZero. Starting at zero creates a gap that AVAssetWriter
        // bridges with an edit list (elst atom) — Unity's VideoPlayer can't handle
        // edit lists, which breaks seeking. Starting at the actual PTS eliminates
        // the gap entirely. Video PTS stays session-relative, aligned with
        // sensor/pose CSVs and audio.
        [_videoWriter startSessionAtSourceTime:pts];
        _videoSessionStarted = YES;
        NSLog(@"[BR] VideoWriter session started (first frame pts=%.3fs)", CMTimeGetSeconds(pts));
    }
```

- [ ] **Step 4: Commit**

```bash
cd /Users/francisco/dev/unity/barknito
git add Assets/Plugins/iOS/SessionCapture/VideoCapture.mm
git commit -m "fix(video): use 19200 timescale + start session at first frame PTS

AVAssetWriter remaps nanosecond timescale (1e9) to internal 600,
losing precision. Starting session at kCMTimeZero while first frame
arrives at ~200ms creates a gap that generates a broken edit list
(elst) and non-zero start_pts — Unity's VideoPlayer can't seek.

Fix by:
1. Using timescale 19200 (LCM-friendly for 24/30/60fps)
2. Starting session at first frame's actual PTS (no gap → no edit list)
Video PTS stays session-relative, aligned with sensors/poses/audio."
```

---

### Task 2: Apply the same fix to DepthVideoCapture.mm

**Files:**
- Modify: `Assets/Plugins/iOS/SessionCapture/DepthVideoCapture.mm`
  - Lines 11-20: add timescale constant
  - Lines 198-206: change PTS computation
  - Lines 215-220: start session at first frame PTS

- [ ] **Step 1: Add the timescale constant**

After line 19 (`static CMTime _lastDepthPTS;`), add:

```objc
static const int32_t kDepthTimescale = 19200;
```

- [ ] **Step 2: Change PTS computation in DepthVideoCapture_AppendDepthFrame**

Replace lines 198-206:

```objc
    CMTime pts = CMTimeMake(timestampNs, 1000000000);

    // Enforce strictly monotonic PTS.
    if (CMTIME_IS_VALID(_lastDepthPTS) && CMTimeCompare(pts, _lastDepthPTS) <= 0) {
        pts = CMTimeAdd(_lastDepthPTS, CMTimeMake(1, 1000));
        if (_depthFrameCount < 10 || _depthFrameCount % 100 == 0)
            NSLog(@"[BR] DepthVideoWriter: non-monotonic PTS at frame #%d, nudged to %.3fs",
                  _depthFrameCount, CMTimeGetSeconds(pts));
    }
```

With:

```objc
    int64_t ticks = (int64_t)((double)timestampNs / 1e9 * kDepthTimescale);
    CMTime pts = CMTimeMake(ticks, kDepthTimescale);

    // Enforce strictly monotonic PTS.
    if (CMTIME_IS_VALID(_lastDepthPTS) && CMTimeCompare(pts, _lastDepthPTS) <= 0) {
        pts = CMTimeAdd(_lastDepthPTS, CMTimeMake(1, kDepthTimescale));
        if (_depthFrameCount < 10 || _depthFrameCount % 100 == 0)
            NSLog(@"[BR] DepthVideoWriter: non-monotonic PTS at frame #%d, nudged to %.3fs",
                  _depthFrameCount, CMTimeGetSeconds(pts));
    }
```

- [ ] **Step 3: Start session at first frame's PTS**

Replace lines 215-220:

```objc
    if (!_depthSessionStarted) {
        // Start at time zero — matches video/audio writers and session-relative PTS.
        [_depthWriter startSessionAtSourceTime:kCMTimeZero];
        _depthSessionStarted = YES;
        NSLog(@"[BR] DepthVideoWriter session started (first frame pts=%.3fs)", CMTimeGetSeconds(pts));
    }
```

With:

```objc
    if (!_depthSessionStarted) {
        // Start at first frame's actual PTS to avoid edit list generation.
        [_depthWriter startSessionAtSourceTime:pts];
        _depthSessionStarted = YES;
        NSLog(@"[BR] DepthVideoWriter session started (first frame pts=%.3fs)", CMTimeGetSeconds(pts));
    }
```

- [ ] **Step 4: Commit**

```bash
cd /Users/francisco/dev/unity/barknito
git add Assets/Plugins/iOS/SessionCapture/DepthVideoCapture.mm
git commit -m "fix(depth-video): same timescale + session-start fix as RGB video

Apply identical fix: 19200 timescale + start session at first frame PTS
to eliminate edit list generation by AVAssetWriter for depth recordings."
```

---

### Task 3: On-device verification

This task validates the fix produces correct MP4 metadata by recording a session and inspecting the output.

- [ ] **Step 1: Record a test session on the device**

Build and deploy the app to an iOS device. Record a session of at least 10 seconds.

- [ ] **Step 2: Pull the video file from the device**

Either download from GCS after upload completes, or use Xcode's device file browser to extract the `.mp4` from the app's Documents directory.

- [ ] **Step 3: Verify the MP4 metadata with ffprobe**

```bash
ffprobe -v error -show_entries stream=time_base,start_pts,start_time,nb_frames -of default video.mp4
```

Expected output — `time_base` should be `1/19200` and `start_pts` should be a small value near `19200 * 0.2 = 3840` (the ~200ms skip), NOT 0:
```
time_base=1/19200
start_pts=~3840
start_time=~0.200
nb_frames=<some number>
```

The key difference from the broken original: `time_base` is now `1/19200` (not `1/600`), and there should be no edit list creating an artificial offset.

- [ ] **Step 4: Verify no edit list is present**

```bash
ffprobe -v trace video.mp4 2>&1 | grep -E "elst|edts"
```

Expected: No output (no edit list), OR an edit list with zero media-time offset. The absence of edit list is the primary success criterion.

- [ ] **Step 5: Test seeking in Unity**

Load the recorded video in the session replay player (either via StreamingAssets or GCS browser). Verify:
- Scrubbing to arbitrary positions works without artifacts
- Frame-by-frame stepping is accurate
- Video timestamps stay in sync with pose/sensor overlays (no 200ms drift)

- [ ] **Step 6: Compare with the old ffmpeg-fixed file**

```bash
# Old fixed file for reference:
ffprobe -v error -show_entries stream=time_base,start_pts,start_time -of default video_fixed.mp4
# time_base should match (1/19200). start_pts may differ (ffmpeg zeros it,
# our fix preserves session-relative time) — that's fine as long as seeking works.
```
