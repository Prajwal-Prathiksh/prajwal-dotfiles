#!/bin/bash

set -euo pipefail

SINK="@DEFAULT_AUDIO_SINK@"
ACTION="${1:-raise}"
STEP="${2:-5}"
MONITOR="$(omarchy-hyprland-monitor-focused 2>/dev/null || true)"
[[ -z "$MONITOR" ]] && MONITOR="$(hyprctl monitors -j 2>/dev/null | jq -r '.[] | select(.focused == true).name' | head -n1)"

apply_action() {
  case "$ACTION" in
    raise)
      wpctl set-mute "$SINK" 0
      wpctl set-volume -l 1.0 "$SINK" "${STEP}%+"
      ;;
    lower)
      wpctl set-volume -l 1.0 "$SINK" "${STEP}%-"
      ;;
    mute-toggle)
      wpctl set-mute "$SINK" toggle
      ;;
    *)
      echo "Unknown action: $ACTION" >&2
      exit 1
      ;;
  esac
}

read_audio_state() {
  wpctl get-volume "$SINK" 2>/dev/null || true
}

progress_from_percent() {
  local percent="$1"
  local progress
  progress="$(awk -v p="$percent" 'BEGIN { printf "%.2f", p / 100 }')"
  [[ "$progress" == "0.00" ]] && progress="0.01"
  printf '%s\n' "$progress"
}

icon_from_state() {
  local muted="$1"
  local percent="$2"

  if [[ "$muted" == "1" || "$percent" -le 0 ]]; then
    printf 'sink-volume-muted-symbolic\n'
  elif [[ "$percent" -le 33 ]]; then
    printf 'sink-volume-low-symbolic\n'
  elif [[ "$percent" -le 66 ]]; then
    printf 'sink-volume-medium-symbolic\n'
  else
    printf 'sink-volume-high-symbolic\n'
  fi
}

apply_action

raw_state="$(read_audio_state)"
volume="$(awk '/Volume:/ { print $2 }' <<< "$raw_state")"
muted=0
[[ "$raw_state" == *"[MUTED]"* ]] && muted=1

percent="$(awk -v v="${volume:-0}" 'BEGIN { printf "%d", (v * 100) + 0.5 }')"
icon="$(icon_from_state "$muted" "$percent")"
progress="$(progress_from_percent "$percent")"
label="${percent}%"
[[ "$muted" == "1" ]] && label="Muted"

if [[ -n "$MONITOR" ]]; then
  swayosd-client \
    --monitor "$MONITOR" \
    --custom-icon "$icon" \
    --custom-progress "$progress" \
    --custom-progress-text "$label"
else
  swayosd-client \
    --custom-icon "$icon" \
    --custom-progress "$progress" \
    --custom-progress-text "$label"
fi
