# Session Viewer Agent Notes

## Cloud Run Deploy Prerequisite

The Terraform for session viewer deployment expects a real container image URI in
`session_viewer_image`.

Before running `terraform plan` or `terraform apply` for the session viewer
Cloud Run service, build and push the image first:

```bash
cd /Users/francisco/dev/barknito/session-viewer
./scripts/build-session-viewer-image.sh <tag>
```

Then copy the printed image URI into:

- `/Users/francisco/dev/barknito/infra/environments/dev/terraform.tfvars`
- `/Users/francisco/dev/barknito/infra/environments/prod/terraform.tfvars`

Do not use a placeholder image when applying the real session viewer service.

## Session Bundle Data Contract

See `../ml/docs/session-bundle-contract.md` for the full contract, and
`docs/video-pose-synchronization.md` for this app's timing model.

Two things to keep in mind when touching playback or the skeleton overlay:

- The video's first PTS is not 0. `computeVideoStartOffsetMs` reconstructs that offset
  by end-aligning (`lastFrameTs - duration`), which assumes no trailing gap — measured
  error is 132 ms on one project-4 session and 5 965 ms on another. Prefer
  `sessionMeta.videoStartPtsMs` when the bundle provides it.
- `unproject.ts` assumes the app's Vision-native convention (landscape, bottom-left
  origin) and swaps the intrinsics to match. Bundles declaring
  `landmarkSpace: "display_top_left"` need the unswapped path.

## Deploy hook

`.git/hooks/post-commit` builds and deploys to Cloudflare Pages on **every commit**.
Disable it (`chmod -x .git/hooks/post-commit`) while doing ordinary work, and re-enable
it only when you intend to ship.
