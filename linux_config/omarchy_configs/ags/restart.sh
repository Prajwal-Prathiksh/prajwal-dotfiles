#!/bin/bash

set -euo pipefail

INSTANCE_NAME="omarchy-top-bar"
APP_PATH="$HOME/.config/ags/app.ts"

ags quit -i "$INSTANCE_NAME" >/dev/null 2>&1 || true
pkill -f "ags run $APP_PATH" >/dev/null 2>&1 || true
pkill -f "gjs.*$APP_PATH" >/dev/null 2>&1 || true

if command -v uwsm-app >/dev/null 2>&1; then
  setsid uwsm-app -- ags run "$APP_PATH" --gtk 4 >/dev/null 2>&1 &
else
  setsid ags run "$APP_PATH" --gtk 4 >/dev/null 2>&1 &
fi
