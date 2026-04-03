#!/bin/bash

# Read memory values (kB) from /proc/meminfo and convert to decimal GB.
# This reports used = total - available, which better reflects reclaimable cache.
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
if [ "$mem_pct" -ge 85 ]; then
  state_class="critical"
elif [ "$mem_pct" -ge 65 ]; then
  state_class="warning"
fi

text="󰘚 ${mem_used_gb}GB"
alt="󰘚 ${mem_pct}%"
tooltip="RAM: ${mem_used_gb}GB / ${mem_total_gb}GB (${mem_pct}%)\\nSwap: ${swap_used_gb}GB / ${swap_total_gb}GB (${swap_pct}%)"

printf '{"text":"%s","alt":"%s","tooltip":"%s","class":"%s"}\n' "$text" "$alt" "$tooltip" "$state_class"
