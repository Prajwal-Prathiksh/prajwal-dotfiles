#!/bin/bash

set -uo pipefail

CACHE_FILE="/tmp/ags_cpu.prev"

read -r _ user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
idle_total=$((idle + iowait))
total=$((user + nice + system + idle + iowait + irq + softirq + steal))

usage=0
if [[ -f "$CACHE_FILE" ]]; then
    read -r prev_idle prev_total < "$CACHE_FILE" || true
    if [[ -n "${prev_idle:-}" && -n "${prev_total:-}" ]]; then
        idle_delta=$((idle_total - prev_idle))
        total_delta=$((total - prev_total))
        if (( total_delta > 0 )); then
            usage=$(( (100 * (total_delta - idle_delta)) / total_delta ))
        fi
    fi
fi
printf '%s %s\n' "$idle_total" "$total" > "$CACHE_FILE"

read -r load1 load5 load15 _ < /proc/loadavg
cores=$(nproc 2>/dev/null || echo 1)

state_class="normal"
if (( usage >= 85 )); then
    state_class="critical"
elif (( usage >= 65 )); then
    state_class="warning"
fi

jq -cn \
    --arg text "󰍛  ${usage}%" \
    --arg class "$state_class" \
    --arg usage "${usage}%" \
    --arg load1 "$load1" \
    --arg load5 "$load5" \
    --arg load15 "$load15" \
    --arg cores "$cores" \
    '{
        text:$text,
        class:$class,
        usage:$usage,
        load1:$load1,
        load5:$load5,
        load15:$load15,
        cores:$cores
    }'
