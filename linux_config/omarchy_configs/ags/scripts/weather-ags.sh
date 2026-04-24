#!/bin/bash

set -euo pipefail

WEATHER_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/weather" && pwd)"

# shellcheck source=/dev/null
source "${WEATHER_LIB_DIR}/common.sh"
# shellcheck source=/dev/null
source "${WEATHER_LIB_DIR}/helpers.sh"
# shellcheck source=/dev/null
source "${WEATHER_LIB_DIR}/cache.sh"
# shellcheck source=/dev/null
source "${WEATHER_LIB_DIR}/state.sh"
# shellcheck source=/dev/null
source "${WEATHER_LIB_DIR}/render.sh"

parse_args "$@"

if [[ "$MODE" == "cache-dir" ]]; then
    printf '%s\n' "$CACHE_DIR"
    exit 0
fi

STATE=$(load_state)

if [[ -n "$ACTION" ]]; then
    apply_action "$STATE"
    STATE=$(normalize_state "$NEXT_STATE")
    save_state "$STATE"
fi

if [[ "$MODE" == "bar" ]]; then
    render_bar_output "$STATE"
else
    render_bundle_json "$STATE" "$FORCE_REFRESH"
fi
