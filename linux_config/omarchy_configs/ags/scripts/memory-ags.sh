#!/bin/bash

mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
mem_avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
swap_total_kb=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
swap_free_kb=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)

mem_used_kb=$((mem_total_kb - mem_avail_kb))
swap_used_kb=$((swap_total_kb - swap_free_kb))

mem_pct=$(awk -v u="$mem_used_kb" -v t="$mem_total_kb" 'BEGIN { if (t > 0) printf "%.0f", (u*100)/t; else print "0" }')
swap_pct=$(awk -v u="$swap_used_kb" -v t="$swap_total_kb" 'BEGIN { if (t > 0) printf "%.0f", (u*100)/t; else print "0" }')

mem_used_gb=$(awk -v kb="$mem_used_kb" 'BEGIN { printf "%.1f", (kb*1024)/1000000000 }')
mem_total_gb=$(awk -v kb="$mem_total_kb" 'BEGIN { printf "%.1f", (kb*1024)/1000000000 }')
swap_used_gb=$(awk -v kb="$swap_used_kb" 'BEGIN { printf "%.1f", (kb*1024)/1000000000 }')
swap_total_gb=$(awk -v kb="$swap_total_kb" 'BEGIN { printf "%.1f", (kb*1024)/1000000000 }')

state_class="normal"
if [[ "$mem_pct" -ge 85 ]]; then
    state_class="critical"
elif [[ "$mem_pct" -ge 65 ]]; then
    state_class="warning"
fi

top_json='[]'
if top_output=$(
    ps -eo rss=,comm= 2>/dev/null | \
        awk '{a[$2]+=$1} END {for (i in a) print a[i], i}' | \
        sort -rn | \
        head -n 5 | \
        awk '
            BEGIN { print "["; first = 1 }
            {
                gb = $1 / 1048576
                name = $2
                gsub(/\\/,"\\\\",name)
                gsub(/"/,"\\\"",name)
                if (!first) print ","
                printf "{\"name\":\"%s\",\"gb\":\"%.2f GB\"}", name, gb
                first = 0
            }
            END { print "]" }
        '
); then
    if jq -e . >/dev/null 2>&1 <<< "$top_output"; then
        top_json="$top_output"
    fi
fi

jq -cn \
    --arg text "󰘚  ${mem_used_gb}GB" \
    --arg class "$state_class" \
    --arg used_gb "${mem_used_gb} GB" \
    --arg used_pct "${mem_pct}%" \
    --arg total_gb "${mem_total_gb} GB" \
    --arg swap_gb "${swap_used_gb} GB" \
    --arg swap_pct "${swap_pct}%" \
    --arg swap_total_gb "${swap_total_gb} GB" \
    --argjson top "${top_json:-[]}" \
    '{
        text:$text,
        class:$class,
        used_gb:$used_gb,
        used_pct:$used_pct,
        total_gb:$total_gb,
        swap_gb:$swap_gb,
        swap_pct:$swap_pct,
        swap_total_gb:$swap_total_gb,
        top:$top
    }'
