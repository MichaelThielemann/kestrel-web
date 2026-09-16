#!/usr/bin/env bash
# Publishes every workspace package (root and packages/*) whose version is not on the registry yet.
# DRY_RUN=1 only prints the decisions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for dir in "$ROOT" "$ROOT"/packages/*/; do
  name="$(node -p "require('$dir/package.json').name")"
  version="$(node -p "require('$dir/package.json').version")"
  private="$(node -p "require('$dir/package.json').private === true")"
  if [ "$private" = "true" ]; then continue; fi
  if curl -sf -o /dev/null "https://registry.npmjs.org/${name/\//%2F}/$version"; then
    echo "skip    $name@$version (already on the registry)"
    continue
  fi
  echo "publish $name@$version"
  if [ "${DRY_RUN:-0}" = "1" ]; then continue; fi
  (cd "$dir" && pnpm publish --access public --provenance --no-git-checks)
done
