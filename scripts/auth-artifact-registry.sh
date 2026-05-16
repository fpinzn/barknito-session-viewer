#!/usr/bin/env bash

set -euo pipefail

GCLOUD_BIN="/Users/francisco/dev/tools/google-cloud-sdk/bin/gcloud"
GCLOUD_PYTHON="/opt/homebrew/bin/python3.11"
PROJECT_ID="${1:-barknito}"
REGION="${2:-us-central1}"

env CLOUDSDK_PYTHON="${GCLOUD_PYTHON}" "${GCLOUD_BIN}" auth login --no-launch-browser
env CLOUDSDK_PYTHON="${GCLOUD_PYTHON}" "${GCLOUD_BIN}" artifacts repositories list \
  --location="${REGION}" \
  --project="${PROJECT_ID}"
