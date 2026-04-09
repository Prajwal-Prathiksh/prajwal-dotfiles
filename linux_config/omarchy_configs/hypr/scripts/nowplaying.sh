#!/bin/bash

# Define the players you actually use
TARGET_PLAYERS="spotify,chromium,brave,vivaldi,microsoft-edge,google-chrome"

# 1. Check the status of ONLY your target players
# This prevents a random paused browser tab from overriding your music
STATUS=$(playerctl -p "$TARGET_PLAYERS" status 2>/dev/null)

# 2. If none of those players are running or playing, show idle
if [ -z "$STATUS" ] || [ "$STATUS" != "Playing" ]; then
    echo "󰝛  System Idle"
    exit 0
fi

# 3. Get the metadata for the active target player
player_name=$(playerctl -p "$TARGET_PLAYERS" metadata --format '{{playerName}}' 2>/dev/null)

if echo "$player_name" | grep -iq 'spotify'; then
    icon=""
    song_info="$(playerctl -p spotify metadata --format "{{artist}} - {{title}}")"
elif echo "$player_name" | grep -iqE 'chrome|chromium|brave|vivaldi|edge'; then
    icon=""
    # Browsers often don't have artist metadata formatted as cleanly as Spotify
    song_info="$(playerctl -p "$player_name" metadata --format "{{title}}")"
else
    icon="󰝚"
    song_info="$(playerctl -p "$player_name" metadata --format "{{title}}")"
fi

echo "${icon}   ${song_info}"