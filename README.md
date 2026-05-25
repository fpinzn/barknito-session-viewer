# Session Viewer

Browser-based session viewer built with React, TypeScript, Vite, and `react-three-fiber`.

## Local Development

Requirements:
- Node.js 20+
- npm

Commands:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Deployment

The intended deployment shape is:

- frontend: static Vite build on Cloudflare Pages
- backend: ignored-sessions API on Cloud Run

The current backend deployable artifact is still a container image built from
this repo.

### Required backend image build step

Before running Terraform for the session viewer API service, build and push a
real container image:

```bash
cd /Users/francisco/dev/barknito/session-viewer
./scripts/build-session-viewer-image.sh <tag>
```

That script prints the exact `session_viewer_image` value to place in:

- `/Users/francisco/dev/barknito/infra/environments/dev/terraform.tfvars`
- `/Users/francisco/dev/barknito/infra/environments/prod/terraform.tfvars`

Terraform cannot deploy the Cloud Run service without that image URI.

### Frontend API base URL

Production frontend builds use:

- `VITE_IGNORED_SESSIONS_API_BASE_URL`

The current production config points the static frontend at:

- `https://session-viewer-dev-uwtjfd6jnq-uc.a.run.app`

If the API origin changes, update `.env.production` before building the static
frontend.

### Artifact Registry

The script assumes an Artifact Registry Docker repository named
`session-viewer` in `us-central1`. If it does not exist yet, create it once:

```bash
gcloud artifacts repositories create session-viewer \
  --repository-format=docker \
  --location=us-central1 \
  --description="Session Viewer images"
```

### Important: Google OAuth allowed origins

The app loads Google Identity Services in the browser and uses the OAuth client ID hardcoded in [src/features/gcs-browser/auth.ts](/Users/francisco/dev/barknito/session-viewer/src/features/gcs-browser/auth.ts:1).

For static hosting, add the Pages origin to the Google Cloud Console for this OAuth client:

- Authorized JavaScript origins: `https://session-viewer.pages.dev`
- Authorized JavaScript origins: `https://<your-preview>.session-viewer.pages.dev`

If you also use the Cloud Run frontend temporarily, add that origin too:

- Authorized JavaScript origins: `https://<your-cloud-run-domain>`

If you use a custom domain, add that origin too:

- Authorized JavaScript origins: `https://<your-custom-domain>`

Without this, `Sign in with Google` will fail in production even if the site itself deploys correctly.

## Notes

- The current production build succeeds, but the main JS bundle is large enough for Vite to warn about chunk size during build.

## Operational Guides

- [Label Studio project setup](docs/label-studio-project-setup.md)
