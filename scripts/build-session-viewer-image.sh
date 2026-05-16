#!/usr/bin/env bash

set -euo pipefail

GCLOUD_BIN="/Users/francisco/dev/tools/google-cloud-sdk/bin/gcloud"
GCLOUD_PYTHON="/opt/homebrew/bin/python3.11"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/build-session-viewer-image.sh <tag> [project_id] [region] [repository]

Builds and pushes the Session Viewer Cloud Run image with Cloud Build, then
prints the exact Terraform value to use for session_viewer_image.

Defaults:
  project_id: barknito
  region: us-central1
  repository: session-viewer
EOF
}

if [[ $# -lt 1 || $# -gt 4 ]]; then
  usage
  exit 1
fi

TAG="$1"
PROJECT_ID="${2:-barknito}"
REGION="${3:-us-central1}"
REPOSITORY="${4:-session-viewer}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/session-viewer:${TAG}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

env CLOUDSDK_PYTHON="${GCLOUD_PYTHON}" "${GCLOUD_BIN}" builds submit --tag "${IMAGE_URI}"

printf '\nBuilt and pushed image:\n%s\n\n' "${IMAGE_URI}"
printf 'Terraform value:\nsession_viewer_image = "%s"\n' "${IMAGE_URI}"
