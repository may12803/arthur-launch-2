#!/bin/bash
# Deploy script - must be run from within the arthur-launch directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="arthur-online"
cd "$SCRIPT_DIR"
exec flyctl deploy --remote-only -c "$SCRIPT_DIR/fly.toml" -a "$APP_NAME"
