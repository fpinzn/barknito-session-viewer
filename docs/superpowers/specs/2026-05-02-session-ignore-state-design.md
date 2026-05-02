# Session Ignore State Design

## Goal

Add a persistent "ignored session" flag to the session browser so users can mark test or otherwise irrelevant sessions directly from the thumbnail grid. Ignored sessions should disappear from the normal device/date views and instead appear in separate ignored-session device/date views. The ignore state becomes a shared source of truth for future bulk export tooling outside this UI.

## Scope

This design covers:

- a unified deployment for frontend and API from this repository
- a small API for reading and mutating ignored-session state
- a dedicated Cloud SQL database on the existing instance
- UI changes for the session thumbnail grid
- authorization based on the caller's actual access to the environment bucket

This design does not cover:

- bulk export UI inside this app
- changes to Label Studio itself
- per-user ignore state
- dimming ignored sessions inside the main browser views

## Current Constraints

- The current app is a static Vite frontend deployed to Cloudflare Pages.
- The frontend already authenticates users with Google in the browser to access GCS buckets.
- The frontend cannot connect directly to Cloud SQL securely.
- The existing Cloud SQL instance is provisioned in `../infra/label-studio/main.tf`.
- The Terraform definition for that instance does not currently declare `backup_configuration`, so automatic backups are not explicitly managed in repo state.

## Decisions

### Deployment

Move this repo from a static Cloudflare Pages deployment to a unified Cloud Run service.

The service will:

- serve the built frontend assets
- expose same-origin API routes under `/api`
- connect to the existing Cloud SQL instance through the Cloud SQL connector

This keeps ownership in one repo and avoids a split deployment model.

### Repository Structure

Restructure the repo into two top-level application areas:

- `frontend/`: the existing Vite React app with minimal path updates
- `server/`: a small Node service that serves the frontend build output and exposes the API

The existing frontend code should move without behavioral refactors beyond the paths and API integration needed for this feature.

### Persistence

Create a new database on the existing Cloud SQL instance for session-viewer metadata. Do not store this table in the existing `labelstudio` database.

Reasoning:

- ignore state is app metadata, not Label Studio application data
- keeping it separate avoids coupling to Label Studio schema and lifecycle
- future bulk export jobs can query a purpose-built database cleanly

### Environment Scoping

Ignore state is global and shared by all users, but scoped per environment.

The app will use a single table and include `environment` in the key rather than splitting by table or database per environment. This keeps infra and queries simpler while preserving the required `dev` and `prod` separation.

### Authorization

The API must only allow users who have access to the environment's GCS bucket.

The client will send the Google access token it already uses for GCS. The API will:

1. validate that a bearer token is present
2. map `env` to the target bucket
3. make a GCS request with that token against the target bucket
4. reject the request with `403` if Google denies access
5. resolve the caller's email server-side from Google and use that for audit fields

The API must not trust any user email passed by the client.

## Data Model

Create table `ignored_sessions` with one row only when a session is currently ignored.

Columns:

- `environment text not null`
- `device_id text not null`
- `session_id text not null`
- `session_path text not null`
- `ignored_at timestamptz not null default now()`
- `ignored_by_email text not null`

Primary key:

- `(environment, session_path)`

Semantics:

- row exists: session is ignored
- row missing: session is not ignored
- ignore action: upsert row with latest actor and timestamp
- unignore action: delete row

Field meanings:

- `session_path` is the full folder path already used by the UI, for example `device-a/20260502-143000`
- `session_id` is the leaf folder name, for example `20260502-143000`
- `device_id` is the device portion of the path, for example `device-a`

The primary key uses `session_path` instead of `session_id` because `session_id` is not guaranteed to be unique across devices.

## API

### `GET /api/ignored-sessions?env=<env>`

Purpose:

- return all ignored sessions for one environment

Request requirements:

- valid Google bearer token
- caller must have access to the bucket mapped to `env`

Response:

- array of ignored-session rows for that environment

Expected usage:

- frontend fetches this once per selected environment and builds a local map keyed by `session_path`

### `PUT /api/ignored-sessions`

Request body:

- `env`
- `deviceId`
- `sessionId`
- `sessionPath`
- `ignored`

Behavior:

- if `ignored` is `true`, upsert the row and set `ignored_at` plus `ignored_by_email`
- if `ignored` is `false`, delete the row for `(environment, session_path)`

Request requirements:

- valid Google bearer token
- caller must have access to the bucket mapped to `env`

Validation:

- `env` must be one of the supported environments
- `deviceId`, `sessionId`, and `sessionPath` must be non-empty
- `sessionPath` must match the provided `deviceId` and `sessionId`

## Frontend Behavior

### Session Grid

Add a checkbox overlay at the top of each session thumbnail card.

Behavior:

- checked means ignored
- ignored sessions are removed from the normal device/date views
- ignored sessions are shown in separate ignored-session device/date views
- clicking the checkbox toggles ignore state without opening the session
- clicking elsewhere on the card still opens the session

The visible grouping should be derived entirely from the ignored-session map returned by the API.

### State Flow

On browser load or environment switch:

1. load devices and sessions as the app does today
2. fetch ignored-session rows for the current environment
3. derive a local lookup map keyed by `session_path`
4. partition sessions into normal and ignored groups from that lookup
5. render the normal and ignored sections separately

On toggle:

1. update the local checkbox state optimistically
2. call `PUT /api/ignored-sessions`
3. if the API fails, revert the local state and show an error

### Visual Behavior

Ignored sessions do not stay in the main session grid/list. They move into dedicated ignored-session sections.

The UI should show enough context to make the state obvious:

- checked overlay
- separate ignored-session sections for both device and date browsing modes
- optional tooltip using `ignored_by_email` and `ignored_at` if the design already has an appropriate hover pattern

The tooltip is optional and should only be added if it stays small and does not force extra complexity.

### Section Layout

Both browsing modes should render two distinct result areas:

- active sessions
- ignored sessions

For `By Device`:

- the normal device groups should only contain non-ignored sessions
- a separate ignored area should show ignored sessions grouped by device

For `By Date`:

- the normal date groups should only contain non-ignored sessions
- a separate ignored area should show ignored sessions grouped by date

The ignored sections should use the same card component and open-session behavior as the main sections to avoid duplicated UI logic.

### Default Browsing Mode

The browser should default to `By Date` when the session browser loads.

Reasoning:

- the ignore workflow is primarily about sorting through many recent sessions
- date-first browsing is the more useful default for reviewing and triaging sessions across devices
- device-first browsing remains available as an explicit switch, but it should not be the initial mode

## Server Responsibilities

The Node service is responsible for:

- serving the frontend assets
- verifying caller authorization for the requested environment
- resolving the caller email server-side
- reading and mutating ignored-session rows
- returning actionable HTTP errors

The service should stay narrow and avoid generic abstractions. This feature only needs one auth path and two routes.

## Error Handling

Frontend:

- if ignored-session fetch fails, keep the browser usable and surface an ignore-state-specific error
- if a toggle fails, revert the optimistic update and show an actionable error

API:

- `401` for missing or invalid bearer token
- `403` for callers without access to the environment bucket
- `400` for invalid `env` or inconsistent session payload
- `500` for database or unexpected server failures

Errors should include enough structured context in server logs to debug environment, path, and upstream Google response details.

## Infra Changes

Changes needed in `../infra`:

- create a new database on the existing Cloud SQL instance for session-viewer metadata
- create an app-specific DB user and secret
- deploy this repository as a Cloud Run service
- grant the Cloud Run service account Cloud SQL access
- configure environment variables and Cloud SQL connection mount

Backups:

- the current Terraform for `google_sql_database_instance.label_studio` does not explicitly configure automatic backups
- this should be verified against the deployed instance in GCP
- if backups are expected, add explicit Terraform configuration rather than relying on unstated defaults

## Verification

Minimum verification for implementation:

1. Signed-in user with bucket access loads the browser and sees ignored state for the selected environment.
2. Toggling ignore on a session removes it from the normal section, places it in the ignored section, and persists a row with `environment`, `device_id`, `session_id`, `session_path`, `ignored_at`, and `ignored_by_email`.
3. Toggling back removes the row and moves the session from the ignored section back into the normal section.
4. A user without bucket access receives `403` from the API.
5. The unified Cloud Run deployment serves both the frontend and API from the same origin.

## Open Items Resolved

- Ignore state is global, not per-user.
- Ignore state is scoped by environment.
- Ignored sessions move to dedicated ignored-session device/date sections.
- The UI does not implement bulk export for this feature.
- The API lives in this repo.
- Deployment is unified on Cloud Run.
- User identity is stored as email and resolved server-side.
