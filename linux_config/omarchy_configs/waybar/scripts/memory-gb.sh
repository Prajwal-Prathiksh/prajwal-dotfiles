#!/bin/bash

# Read system memory stats
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

# --- TOP 5 PROGRAMS AGGREGATOR ---
# 1. ps gets raw numeric RSS (KB) and command names
# 2. awk sums up RSS for all threads with the same name (e.g., merging all 'code' processes)
# 3. sort -rn sorts the raw numbers high-to-low
# 4. head -n 5 strictly limits the list to the top 5 consumers
# 5. Final awk formats the output into the aligned GB table for the tooltip
top_procs=$(ps -eo rss,comm --no-headers | \
    awk '{a[$2]+=$1} END {for (i in a) print a[i], i}' | \
    sort -rn | \
    head -n 5 | \
    awk '{printf "%-15s %5.2f GB\\n", $2, $1/1048576}')

state_class="normal"
if [ "$mem_pct" -ge 85 ]; then state_class="critical"; elif [ "$mem_pct" -ge 65 ]; then state_class="warning"; fi

text="󰘚  ${mem_used_gb}GB"
tooltip="<b>RAM Usage</b>\\nUsed: ${mem_used_gb} GB (${mem_pct}%)\\nSwap: ${swap_used_gb} GB (${swap_pct}%)\\n\\n<b>Top 5 Programs:</b>\\n<tt>${top_procs}</tt>"

printf '{"text":"%s","tooltip":"%s","class":"%s"}\n' "$text" "$tooltip" "$state_class"