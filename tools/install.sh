#!/usr/bin/env bash
# Copy the plugin into an Obsidian vault for testing.
#
#   tools/install.sh "/d/knowledge repository"
#
# Only the three files Obsidian actually loads are copied, plus the manifest.
set -euo pipefail

VAULT="${1:-}"
if [ -z "$VAULT" ]; then
  echo "usage: tools/install.sh <vault path>" >&2
  exit 1
fi

if [ ! -d "$VAULT/.obsidian" ]; then
  echo "error: '$VAULT' does not look like an Obsidian vault (no .obsidian folder)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$VAULT/.obsidian/plugins/canvas-node-align"

mkdir -p "$DEST"
for f in main.js manifest.json styles.css; do
  cp "$ROOT/$f" "$DEST/$f"
  echo "  -> $f"
done

echo
echo "Installed to $DEST"
echo "Reload Obsidian (Ctrl+R) to pick it up."
