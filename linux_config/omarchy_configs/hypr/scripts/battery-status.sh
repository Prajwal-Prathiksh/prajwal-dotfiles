#!/bin/bash
bat_path=$(find /sys/class/power_supply/ -name 'BAT*' | head -n 1)
[ -z "$bat_path" ] && exit 0
perc=$(cat "$bat_path/capacity")
stat=$(cat "$bat_path/status")
icons=("󰂃" "󰁺" "󰁻" "󰁼" "󰁽" "󰁾" "󰁿" "󰂀" "󰂁" "󰁹")
icon=${icons[$((perc / 10))]}
[ "$stat" = "Charging" ] && icon="󰂄"
echo "$icon $perc%"