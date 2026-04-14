#!/bin/bash
bat_path=$(find /sys/class/power_supply/ -name 'BAT*' | head -n 1)
[ -z "$bat_path" ] && exit 0
perc=$(cat "$bat_path/capacity")
stat=$(cat "$bat_path/status")
icons=("󰂃" "󰁺" "󰁻" "󰁼" "󰁽" "󰁾" "󰁿" "󰂀" "󰂁" "󰁹")
icon=${icons[$(( perc >= 100 ? 9 : perc / 10 ))]}

ac_online=0
for source in /sys/class/power_supply/*; do
	[ -f "$source/type" ] || continue
	[ -f "$source/online" ] || continue
	case "$(cat "$source/type")" in
		Mains|USB)
			[ "$(cat "$source/online")" = "1" ] && ac_online=1 && break
			;;
	esac
done

[ "$stat" = "Charging" ] && icon="󰂄"
[ "$ac_online" = "1" ] && [ "$stat" != "Discharging" ] && icon=""
echo "$icon  $perc%"