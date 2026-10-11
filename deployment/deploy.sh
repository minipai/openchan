#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
deployment_dir="$repo_root/deployment"
dist_dir="$repo_root/packages/app/dist"

(
  cd "$repo_root"
  VITE_OPENCODE_SERVER_MODE=none OPENCODE_CHANNEL=prod bun --cwd packages/app run build
)

rsync -a --delete --delete-excluded --exclude='*.map' "$dist_dir/" "$deployment_dir/public/"

cd "$deployment_dir"
npm ci
npm exec -- cf deploy
