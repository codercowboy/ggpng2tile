#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL="$DIR/../src/ggpng2tile.js"

cd "$DIR"

for png in *.png; do
  name="${png%.png}"
  echo "Converting $png..."
  node "$TOOL" "$png" "$name"
done

echo "Done."
