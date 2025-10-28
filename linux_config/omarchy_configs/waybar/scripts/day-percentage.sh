#!/bin/bash

# Calculate day completion percentage
current_time=$(date +%s)
start_of_day=$(date -d "00:00:00" +%s)
seconds_in_day=86400

elapsed_seconds=$((current_time - start_of_day))
percentage=$((elapsed_seconds * 100 / seconds_in_day))

# Clamp percentage between 0-100 (handles edge cases)
if [ $percentage -lt 0 ]; then
    percentage=0
elif [ $percentage -gt 100 ]; then
    percentage=100
fi

# Choose icon based on percentage ranges (circle fill progression)
if [ $percentage -ge 97 ]; then
    icon="󰪥"
elif [ $percentage -ge 85 ]; then
    icon="󰪤"
elif [ $percentage -ge 75 ]; then
    icon="󰪣"
elif [ $percentage -ge 60 ]; then
    icon="󰪢"
elif [ $percentage -ge 50 ]; then
    icon="󰪡"
elif [ $percentage -ge 35 ]; then
    icon="󰪠"
elif [ $percentage -ge 25 ]; then
    icon="󰪟"
else
    icon="󰪞"
fi

echo " $icon $percentage%"