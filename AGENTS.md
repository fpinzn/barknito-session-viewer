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
