#!/usr/bin/env bash

set -euo pipefail

INTERNAL_MONITOR="eDP-1"
INTERNAL_CONFIG="highres,0x0,2"

get_monitors_json() {
    hyprctl monitors -j 2>/dev/null || printf '[]\n'
}

get_first_external_monitor() {
    get_monitors_json | jq -r --arg internal "$INTERNAL_MONITOR" '
        map(select(.name != $internal and ((.disabled // false) | not))) | .[0].name // ""
    '
}

has_external_monitor() {
    [[ -n "$(get_first_external_monitor)" ]]
}

enable_internal() {
    hyprctl keyword monitor "$INTERNAL_MONITOR,$INTERNAL_CONFIG" >/dev/null
    omarchy-restart-ags
}

disable_internal() {
    hyprctl keyword monitor "$INTERNAL_MONITOR,disable" >/dev/null
    omarchy-restart-ags
}

focus_external() {
    local external
    external="$(get_first_external_monitor)"
    [[ -n "$external" ]] || return 0

    hyprctl dispatch focusmonitor "$external" >/dev/null 2>&1 || true
}

lid_state() {
    local state_file
    state_file="$(find /proc/acpi/button/lid -name state 2>/dev/null | head -n1 || true)"
    [[ -n "$state_file" ]] || return 1

    awk '{print tolower($2)}' "$state_file"
}

handle_close() {
    if has_external_monitor; then
        disable_internal
        sleep 0.2
        focus_external
    fi
}

handle_open() {
    enable_internal
}

case "${1:-sync}" in
    close)
        handle_close
        ;;
    open)
        handle_open
        ;;
    sync)
        if [[ "$(lid_state || true)" == "closed" ]]; then
            handle_close
        else
            handle_open
        fi
        ;;
    *)
        printf 'usage: %s [close|open|sync]\n' "$0" >&2
        exit 1
        ;;
esac
