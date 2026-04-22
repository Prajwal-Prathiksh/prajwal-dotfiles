#!/bin/bash

set -euo pipefail

TRIGGER_FILE="${HOME}/.config/ags/weather-popup.trigger"

monitors_json="$(hyprctl monitors -j 2>/dev/null || printf '[]\n')"
if ! jq -e '.' >/dev/null 2>&1 <<< "${monitors_json}"; then
    monitors_json='[]'
fi

focused_monitor_json="$(jq -c '.[] | select(.focused == true)' <<< "${monitors_json}" | head -n1)"
if [[ -z "${focused_monitor_json}" ]]; then
    focused_monitor_json='{}'
fi

monitor_id="$(jq -r '.id // 0' <<< "${focused_monitor_json}")"
monitor_name="$(jq -r '.name // ""' <<< "${focused_monitor_json}")"
token="$(date +%s%N)"

mkdir -p "$(dirname "${TRIGGER_FILE}")"
jq -cn \
    --arg token "${token}" \
    --arg monitorName "${monitor_name}" \
    --argjson monitor "${monitor_id}" \
    '{
        token: $token,
        monitor: $monitor,
        monitorName: $monitorName
    }' > "${TRIGGER_FILE}"
