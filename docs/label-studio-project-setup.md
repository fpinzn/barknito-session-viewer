# Label Studio Project Setup

This guide documents the manual setup that is currently required before pushing
session tasks from Session Viewer into a new Label Studio project.

Use this when:

- you want to annotate private videos stored in the Barknito GCS bucket
- tasks will be created through the Label Studio API or Session Viewer
- Label Studio needs to resolve `gs://...` media URLs into signed playable URLs

Do not use GCS storage sync to create tasks for this workflow. Sync imports the
bucket contents as tasks, which duplicates API-created tasks and can break the
project setup.

## Preconditions

- Label Studio is reachable at `https://label.barknito.com`
- you can log into Label Studio in the browser
- the target bucket already exists:
  - `barknito-sessions-dev` for `dev`
  - `barknito-sessions-prod` for `prod`
- the videos already exist in the bucket
- the tasks will be created separately through the API or Session Viewer

## 1. Create the Project

1. Open Label Studio.
2. Click `Create Project`.
3. Give the project a clear name.
4. Choose the video labeling configuration you want to use.
5. Create the project.

This step creates the annotation project only. It does not connect GCS yet.

## 2. Add the GCS Source Storage

The source storage is required so Label Studio can resolve private
`gs://bucket/path/video.mp4` URLs from tasks into signed browser-playable URLs.

1. Open the new project.
2. Go to `Settings`.
3. Open `Cloud Storage` or `Storage`.
4. Add a new `Google Cloud Storage` source storage.
5. Use these settings:

- `Bucket`: `barknito-sessions-dev` or `barknito-sessions-prod`
- `Google project ID`: `barknito`
- `Prefix`: leave empty unless you intentionally want to scope the project
- `Regex`: `.*video\.mp4$`
- `Use blob URLs`: enabled
- `Presign URLs`: enabled
- `Recursive scan`: disabled

6. Save the storage.

Important:

- do not run sync to generate tasks
- do not use this storage as a dataset import source for JSON
- this storage exists so Label Studio can resolve and sign media URLs for
  already-created tasks

## 3. Add the GCS Target Storage

The target storage is where annotations or exports can be written back.

1. In the same project settings area, add a target `Google Cloud Storage`
   storage.
2. Use the same environment bucket unless you intentionally want a separate
   export bucket.
3. Set the Google project ID to `barknito`.
4. Save the target storage.

If you later standardize a dedicated annotations prefix or export bucket, update
this guide to match the real convention.

## 4. Create Tasks Through the API

For this workflow, tasks should be created by the API, not by GCS sync.

Each video task should include enough metadata for downstream debugging and
filtering. At minimum, use a shape like:

```json
{
  "project": 4,
  "data": {
    "env": "dev",
    "video": "gs://barknito-sessions-dev/96249D21/20260522-154936-b592/video.mp4",
    "bucket": "barknito-sessions-dev",
    "device_id": "96249D21",
    "gcs_prefix": "96249D21/20260522-154936-b592",
    "session_id": "20260522-154936-b592",
    "video_object": "96249D21/20260522-154936-b592/video.mp4"
  },
  "predictions": []
}
```

The important part is that `data.video` is a `gs://...` URI. Label Studio uses
the project source storage to resolve that URI later.

## 5. Verify One Task Before Bulk Import

Before importing a large batch, verify one task end to end:

1. Create one task in the project.
2. Open it in Label Studio.
3. Confirm the video loads.
4. If playback fails, check:

- the project has the correct GCS source storage
- `Use blob URLs` is enabled
- `Presign URLs` is enabled
- `Recursive scan` is disabled
- the task `data.video` path points to a real object
- the object is served as `video/mp4`

## Common Failure Modes

### Storage sync imported the whole bucket

Symptom:

- hundreds of unexpected tasks appear

Cause:

- the project storage was used for import instead of only for media resolution

Fix:

- delete the imported tasks
- keep only the API-created tasks
- keep the source storage, but do not sync again

### Resolver returns `404`

Symptom:

- `/tasks/<id>/resolve/?fileuri=...` returns `404`

Cause:

- project storage exists but is incomplete or misconfigured

Fix:

- confirm the project source storage matches the settings above
- confirm the storage credentials are actually present in Label Studio

### Video still does not play after resolve works

Symptom:

- Label Studio resolves to GCS, but the browser still fails to play

Cause:

- the object exists but has the wrong content type

Fix:

- update the object metadata so `video.mp4` is served as `video/mp4`

## Current Rule of Thumb

- create the Label Studio project manually
- add source and target storages manually
- create tasks through the API
- never use GCS sync to create tasks for this workflow
