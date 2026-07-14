#!/usr/bin/env bash
# Build an installable ahm-core.zip and place it where the Manager app serves it
# (web/public/downloads/ahm-core.zip — the "Download Plugin" link).
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$PLUGIN_DIR/../.." && pwd)"
OUT_DIR="$ROOT_DIR/web/public/downloads"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/ahm-core.zip"

cd "$PLUGIN_DIR/.."
zip -r "$OUT_DIR/ahm-core.zip" ahm-core \
  -x 'ahm-core/build-zip.sh' \
  -x '*/.DS_Store' \
  -x '*/.git/*' \
  -x '*/node_modules/*'

echo "Built $OUT_DIR/ahm-core.zip"
