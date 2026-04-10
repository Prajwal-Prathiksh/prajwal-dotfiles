#!/bin/bash

# ==========================================
# Configuration
# ==========================================
LOCATION="Austin"
FORMAT="%c+%t"
CACHE_FILE="/tmp/waybar_weather.cache"
UPDATE_INTERVAL=600 # Time in seconds (600 = 10 minutes)

# ==========================================
# Logic
# ==========================================
CURRENT_TIME=$(date +%s)

fetch_weather() {
    # Added &m to the URL to explicitly force Metric/Celsius
    WEATHER=$(curl -s -m 2 "https://wttr.in/${LOCATION}?format=${FORMAT}&m")
    
    # Check if curl succeeded AND the output isn't an error page
    if [ $? -eq 0 ] && [ -n "$WEATHER" ] && [[ ! "$WEATHER" == *"Unknown"* ]]; then
        # Remove any plus signs from the output (e.g., +25°C -> 25°C)
        WEATHER=$(echo "$WEATHER" | tr -d '+')
        echo "$WEATHER" > "$CACHE_FILE"
        echo "$WEATHER"
    else
        # If fetch failed (no internet), fall back to cache if it exists
        if [ -f "$CACHE_FILE" ]; then
            cat "$CACHE_FILE"
        else
            echo "󰖪   Weather Offline"
        fi
    fi
}

# ----------------------------------------------------
# Check if script was called by a left-click in Waybar
# ----------------------------------------------------
if [ "$1" == "--update" ]; then
    # Force a fetch and save the result
    NEW_WEATHER=$(fetch_weather)
    
    # Send notification to Mako
    notify-send "Weather Updated" "$NEW_WEATHER" -a "Waybar Weather"
    
    # Send real-time signal (11) to Waybar to immediately redraw the module
    pkill -RTMIN+11 waybar
    exit 0
fi

# ----------------------------------------------------
# Normal execution (called by Waybar interval)
# ----------------------------------------------------
if [ -f "$CACHE_FILE" ]; then
    CACHE_TIME=$(stat -c %Y "$CACHE_FILE")
    TIME_DIFF=$((CURRENT_TIME - CACHE_TIME))

    # If the cache is older than the interval, fetch new data. Otherwise, print cache.
    if [ "$TIME_DIFF" -gt "$UPDATE_INTERVAL" ]; then
        fetch_weather
    else
        cat "$CACHE_FILE"
    fi
else
    fetch_weather
fi