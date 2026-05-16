# Static Frontend + API Split Design

## Goal

Restore fast frontend deploys by moving the session viewer UI back to static hosting while keeping the ignored-sessions API on Cloud Run with the existing Postgres database.

## Scope

This design covers:

- deploying the Vite frontend as a static site again
- keeping only the ignored-sessions API on Cloud Run
- keeping the existing `sessionviewer` database and table
- changing the frontend to call the API through a configured base URL
- updating OAuth and CORS to match the split deployment

This design does not cover:

- changing the ignored-session data model
- removing Postgres
- adding new API features beyond ignored-session read/write
- changing session browsing behavior beyond the deployment split
- replacing Cloudflare Pages with a different static host

## Current Problem

The current unified Cloud Run deployment makes every frontend-only change slow:

- build a container image
- wait for Cloud Build
- roll out a Cloud Run revision
- verify against a transient `run.app` origin

That is the wrong operating model for a mostly static viewer UI.

## Decision

Split the app by deployment artifact, not by repository:

- keep the frontend in this repo and deploy `dist/` to Cloudflare Pages
- keep the backend in this repo and deploy `server/` as an API-only Cloud Run service

The repo stays unified. The deployments become separate.

## Recommended Architecture

### Frontend

Deploy the Vite build output to Cloudflare Pages.

The frontend becomes static-only again:

- no Express static serving
- no same-origin API assumption
- no frontend dependency on Cloud Run rollout speed

Recommended frontend origin:

- `https://session-viewer.pages.dev` for dev until a custom domain is chosen

### Backend

Keep a small Node service on Cloud Run.

The backend does only this:

- `GET /ignored-sessions`
- `PUT /ignored-sessions`
- bearer-token authorization against the environment bucket
- caller email resolution
- Postgres read/write

The backend stops serving frontend files entirely.

### Database

Keep the existing `sessionviewer` database and `ignored_sessions` table.

No schema redesign is needed for this migration.

## Why This Approach

### Option 1: Static frontend + API-only Cloud Run

Pros:

- fast UI deploys
- no container build for frontend-only changes
- backend remains small and purpose-built
- keeps the existing database investment

Cons:

- frontend and API need explicit CORS and base-URL configuration
- deploy flow becomes two artifacts instead of one

### Option 2: Keep everything on Cloud Run

Pros:

- one deployment target
- same-origin by default

Cons:

- slow frontend iteration
- container rebuild for trivial UI changes
- more operational friction than the app justifies

### Option 3: Split into separate frontend and backend repositories

Pros:

- strict separation

Cons:

- unnecessary churn right now
- more moving pieces than the backend size warrants

Recommendation:

Use Option 1.

## Frontend Changes

### API Base URL

Add a Vite environment variable:

- `VITE_IGNORED_SESSIONS_API_BASE_URL`

Behavior:

- if set, the frontend calls `${VITE_IGNORED_SESSIONS_API_BASE_URL}/ignored-sessions`
- if missing, frontend should fail explicitly during ignored-session requests rather than silently guessing

The frontend should no longer hardcode same-origin `/api/...` for ignored sessions.

### Authentication

The frontend keeps the current Google browser sign-in flow.

Required OAuth update:

- the OAuth client must authorize the Pages origin instead of only the transient Cloud Run origin

The frontend still sends the Google bearer token to the backend API.

## Backend Changes

### Route Shape

The API service should expose routes without bundling frontend concerns.

Recommended public API paths:

- `GET /ignored-sessions?env=<env>`
- `PUT /ignored-sessions`

No `/api` prefix is required unless you want it for convention. Either is acceptable, but the frontend and backend should use exactly one consistent public shape.

Recommendation:

- keep `/api/ignored-sessions` only if that avoids extra churn in current clients
- otherwise simplify to `/ignored-sessions`

The key point is that the backend becomes API-only, not that the path name changes.

### CORS

Allow requests only from known frontend origins.

Minimum allowed origin set:

- `https://session-viewer.pages.dev`

Later, add custom domains explicitly when they exist.

The backend should reject unknown browser origins rather than allowing `*`.

### Static Serving

Remove the production dependency on `STATIC_DIR` and frontend asset serving from the deployed API service.

The code may keep a local development mode that can still serve assets if useful, but the deployed backend should not depend on it.

## Infra Changes

### Cloud Run

Keep the existing Cloud Run service, but treat it as API-only.

No new database resources are needed.

Possible cleanup later:

- rename the service or Terraform resource to reflect API-only behavior more clearly

That rename is optional and should not block the split.

### Static Hosting

Deploy the frontend build to Cloudflare Pages.

This should become the primary user-facing session viewer URL.

### Secrets and Variables

Backend keeps:

- `DATABASE_URL`

Frontend gains:

- `VITE_IGNORED_SESSIONS_API_BASE_URL`

No frontend secrets are needed for this API base URL.

## Deployment Flow After Migration

### Frontend-only change

1. build frontend
2. deploy static assets to Pages

No Cloud Run deploy should be needed.

### Backend-only change

1. build API container
2. push image
3. deploy Cloud Run service

No frontend deploy should be needed.

### Database-affecting backend change

1. deploy backend with required bootstrap or migration behavior
2. verify API routes against the existing database

## Risks

### Medium: CORS / OAuth mismatch

If frontend origin, OAuth origin, and backend CORS config drift apart, sign-in or ignored-session requests will fail.

Mitigation:

- keep the allowed frontend origin list explicit in both OAuth and backend config

### Low: Frontend/backend version skew

Frontend and backend will no longer roll together automatically.

Mitigation:

- keep the ignored-sessions API narrow and backward compatible

### Low: Temporary dual-origin confusion

During migration, users may still open the old Cloud Run URL.

Mitigation:

- make Pages the documented primary URL
- stop treating Cloud Run as the frontend entrypoint

## Success Criteria

- the main session viewer loads from static hosting
- ignored-session reads and writes work against the Cloud Run API
- frontend-only changes no longer require container build or Cloud Run rollout
- the Postgres-backed ignored-session state remains unchanged
