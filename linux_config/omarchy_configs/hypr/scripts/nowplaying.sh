#!/bin/bash

player_name=$(playerctl metadata --format '{{playerName}}' | grep -iE 'spotify|chromium|edge')

if echo "$player_name" | grep -iq 'spotify'; then
    icon=""
elif echo "$player_name" | grep -iqE 'chrome|chromium|brave|vivaldi|microsoft-edge|google-chrome'; then
    icon=""
else
    icon=""
fi


song_info="$(playerctl metadata --format "{{artist}} - {{title}}")"
song_info="${icon}   ${song_info}"

echo "$song_info" 