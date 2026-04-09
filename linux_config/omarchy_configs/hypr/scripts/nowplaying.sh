#!/bin/bash
status=$(playerctl status 2>/dev/null)
if [ "$status" != "Playing" ]; then
    echo "󰝛  System Idle"
    exit 0
fi

player_name=$(playerctl metadata --format '{{playerName}}' | grep -iE 'spotify|chromium|edge|brave')

if echo "$player_name" | grep -iq 'spotify'; then
    icon=""
elif echo "$player_name" | grep -iqE 'chrome|chromium|brave|edge'; then
    icon=""
else
    icon="󰎆"
fi

song_info=$(playerctl metadata --format "{{artist}} - {{title}}" | cut -c1-35)
echo "$icon  $song_info"