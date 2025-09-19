#!/bin/bash

# Check if media is paused
if [ "$(playerctl status 2>/dev/null)" = "Paused" ]; then
    exit 0
fi

player_name=$(playerctl metadata --format '{{playerName}}' | grep -iE 'spotify|chromium|edge')

if echo "$player_name" | grep -iq 'spotify'; then
    icon=""
    song_info="$(playerctl metadata --format "{{artist}} - {{title}}")"
elif echo "$player_name" | grep -iqE 'chrome|chromium|brave|vivaldi|microsoft-edge|google-chrome'; then
    icon=""
    song_info="$(playerctl metadata --format "{{title}}")"
else
    icon=""
    song_info=""
fi


song_info="${icon}   ${song_info}"

echo "$song_info"