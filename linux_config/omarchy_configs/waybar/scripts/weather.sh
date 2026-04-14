#!/bin/bash

# ----------------------------
# User config
# ----------------------------
LOCATION="Auto"                  # "Auto" or a city like "Seoul", "Tokyo", "Austin"
CACHE_FILE="/tmp/waybar_weather.cache"
UPDATE_INTERVAL=600              # seconds

CURRENT_TIME=$(date +%s)
MODE="${1:-}"

# Build wttr URLs.
if [[ "${LOCATION,,}" == "auto" ]]; then
    WTTR_JSON_URL="https://wttr.in?format=j1&m"
    WTTR_TIME_URL="https://wttr.in?format=%T+%Z"
    IS_AUTO=1
else
    WTTR_JSON_URL="https://wttr.in/${LOCATION}?format=j1&m"
    WTTR_TIME_URL="https://wttr.in/${LOCATION}?format=%T+%Z"
    IS_AUTO=0
fi

# ----------------------------
# Icon helpers
# ----------------------------

is_night_slot() {
    local t="$1"
    case "$t" in
        0|300|1800|2100) echo 1 ;;
        *) echo 0 ;;
    esac
}

weather_icon() {
    local desc="${1,,}"
    local is_night="${2:-0}"

    if [[ "$is_night" == "1" ]]; then
        case "$desc" in
            *clear*) echo "🌙" ;;
            *partly\ cloudy*) echo "🌙☁️" ;;
            *cloudy*|*overcast*) echo "☁️" ;;
            *mist*|*fog*) echo "🌫️" ;;
            *rain*|*drizzle*|*patchy\ rain*) echo "🌧️" ;;
            *thunder*|*storm*) echo "⛈️" ;;
            *snow*|*sleet*|*ice*) echo "❄️" ;;
            *wind*) echo "🌬️" ;;
            *) echo "🌙" ;;
        esac
    else
        case "$desc" in
            *sunny*|*clear*) echo "☀️" ;;
            *partly\ cloudy*) echo "⛅" ;;
            *cloudy*|*overcast*) echo "☁️" ;;
            *mist*|*fog*) echo "🌫️" ;;
            *rain*|*drizzle*|*patchy\ rain*) echo "🌧️" ;;
            *thunder*|*storm*) echo "⛈️" ;;
            *snow*|*sleet*|*ice*) echo "❄️" ;;
            *wind*) echo "🌬️" ;;
            *) echo "🌤️" ;;
        esac
    fi
}

part_name() {
    case "$1" in
        0) echo "12 AM" ;;
        300) echo "03 AM" ;;
        600) echo "06 AM" ;;
        900) echo "09 AM" ;;
        1200) echo "12 PM" ;;
        1500) echo "03 PM" ;;
        1800) echo "06 PM" ;;
        2100) echo "09 PM" ;;
        *) echo "$1" ;;
    esac
}

short_condition() {
    local desc="$1"
    desc="${desc/Patchy rain nearby/Patchy rain}"
    desc="${desc/Moderate or heavy rain shower/Heavy rain}"
    desc="${desc/Light rain shower/Light rain}"
    desc="${desc/Moderate rain at times/Moderate rain}"
    desc="${desc/Thundery outbreaks in nearby/Thunder nearby}"
    printf '%s' "$desc"
}

# ----------------------------
# Data helpers
# ----------------------------

valid_weather_json() {
    jq -e '.current_condition[0] and .weather[0]' >/dev/null 2>&1 <<< "$1"
}

offline_json() {
    jq -cn \
        --arg text "󰖪 Offline" \
        --arg tooltip "<b>Weather unavailable</b>\nCheck Wi-Fi or wttr.in availability." \
        '{text:$text, tooltip:$tooltip}'
}

offline_bar() {
    printf '󰖪 --\n'
}

get_local_time_text() {
    local t hhmm zone
    t=$(curl -s -m 3 "$WTTR_TIME_URL")

    hhmm=$(grep -oE '^[0-9]{1,2}:[0-9]{2}' <<< "$t")
    zone=$(grep -oE '[A-Za-z_]+/[A-Za-z_+-]+' <<< "$t" | head -n1)

    if [[ -n "$hhmm" && -n "$zone" ]]; then
        printf '%s • %s' "$hhmm" "$zone"
    elif [[ -n "$hhmm" ]]; then
        printf '%s' "$hhmm"
    else
        printf ''
    fi
}

current_slot_from_time_text() {
    local time_text="$1"
    local hhmm

    hhmm=$(grep -oE '[0-9]{1,2}:[0-9]{2}' <<< "$time_text" | head -n1 | tr -d ':')
    [[ -z "$hhmm" ]] && hhmm=1200
    hhmm=$((10#$hhmm))

    if (( hhmm < 300 )); then
        echo 0
    elif (( hhmm < 600 )); then
        echo 300
    elif (( hhmm < 900 )); then
        echo 600
    elif (( hhmm < 1200 )); then
        echo 900
    elif (( hhmm < 1500 )); then
        echo 1200
    elif (( hhmm < 1800 )); then
        echo 1500
    elif (( hhmm < 2100 )); then
        echo 1800
    else
        echo 2100
    fi
}

# Build up to 3 upcoming forecast rows.
# First take remaining slots from today, then spill into tomorrow if needed.
build_upcoming_rows() {
    local raw="$1"
    local now_slot="$2"

    jq -c --argjson now "$now_slot" '
        [
          (.weather[0].hourly
            | map(select((.time|tonumber) > $now))
            | map({
                day_offset: 0,
                time: (.time|tonumber),
                temp: (.tempC // ""),
                desc: (.weatherDesc[0].value // ""),
                wind: (.windspeedKmph // "")
              })),
          (.weather[1].hourly
            | map({
                day_offset: 1,
                time: (.time|tonumber),
                temp: (.tempC // ""),
                desc: (.weatherDesc[0].value // ""),
                wind: (.windspeedKmph // "")
              }))
        ]
        | add
        | .[:3]
        | .[]
    ' <<< "$raw"
}

# ----------------------------
# Main rendering
# ----------------------------

build_outputs() {
    local raw="$1"

    local current_temp current_desc current_wind current_feels
    current_temp=$(jq -r '.current_condition[0].temp_C // ""' <<< "$raw")
    current_desc=$(jq -r '.current_condition[0].weatherDesc[0].value // ""' <<< "$raw")
    current_wind=$(jq -r '.current_condition[0].windspeedKmph // ""' <<< "$raw")
    current_feels=$(jq -r '.current_condition[0].FeelsLikeC // ""' <<< "$raw")
    current_desc=$(short_condition "$current_desc")

    local display_location
    if (( IS_AUTO == 1 )); then
        display_location=$(jq -r '
            [
                .nearest_area[0].areaName[0].value,
                .nearest_area[0].region[0].value
            ]
            | map(select(. != null and . != ""))
            | if length > 0 then join(", ") else "Current Location" end
        ' <<< "$raw")
    else
        display_location="$LOCATION"
    fi

    local local_time_text now_slot current_is_night
    local_time_text=$(get_local_time_text)
    now_slot=$(current_slot_from_time_text "$local_time_text")
    current_is_night=$(is_night_slot "$now_slot")

    local icon
    icon=$(weather_icon "$current_desc" "$current_is_night")

    local bar_text="${icon} ${current_temp}°C"

    if [[ "$MODE" == "--bar" ]]; then
        printf '%s\n' "$bar_text"
        return
    fi

    local tooltip=""
    tooltip+="<b>${display_location}</b>"
    tooltip+=$'\n'
    tooltip+="<span size='large'>${icon} <b>${current_temp}°C</b></span>"
    tooltip+=$'\n'
    tooltip+="<i>${current_desc}</i>"
    tooltip+=$'\n'
    tooltip+="Feels like ${current_feels}°C  •  󰖝 ${current_wind} km/h"
    if [[ -n "$local_time_text" ]]; then
        tooltip+=$'\n'
        tooltip+="<span size='smaller'><i>Last Updated: ${local_time_text}</i></span>"
    fi

    local upcoming_rows
    upcoming_rows=$(build_upcoming_rows "$raw" "$now_slot")

    if [[ -n "$upcoming_rows" ]]; then
        tooltip+=$'\n'$'\n'"<b>Next up</b>"

        while IFS= read -r row; do
            [[ -z "$row" ]] && continue

            local day_offset t label temp desc wind slot_is_night picon
            day_offset=$(jq -r '.day_offset' <<< "$row")
            t=$(jq -r '.time' <<< "$row")
            temp=$(jq -r '.temp' <<< "$row")
            desc=$(jq -r '.desc' <<< "$row")
            wind=$(jq -r '.wind' <<< "$row")

            desc=$(short_condition "$desc")
            slot_is_night=$(is_night_slot "$t")
            picon=$(weather_icon "$desc" "$slot_is_night")
            label=$(part_name "$t")

            if [[ "$day_offset" == "1" ]]; then
                # label="Tomorrow ${label}"
                label="${label}"
            fi

            tooltip+=$'\n'
            tooltip+="${picon} <b>${label}</b>  ${temp}°C  •  <i>${desc}</i>  •  󰖝 ${wind} km/h"
        done <<< "$upcoming_rows"
    fi

    jq -cn \
        --arg text "$bar_text" \
        --arg tooltip "$tooltip" \
        '{text:$text, tooltip:$tooltip}'
}

fetch_weather() {
    local raw
    raw=$(curl -s -m 5 "$WTTR_JSON_URL")

    if valid_weather_json "$raw"; then
        printf '%s' "$raw" > "$CACHE_FILE"
        build_outputs "$raw"
    else
        if [[ -f "$CACHE_FILE" ]]; then
            local cached
            cached=$(cat "$CACHE_FILE")
            if valid_weather_json "$cached"; then
                build_outputs "$cached"
                return
            fi
        fi

        if [[ "$MODE" == "--bar" ]]; then
            offline_bar
        else
            offline_json
        fi
    fi
}

if [[ "$MODE" == "--update" ]]; then
    NEW_JSON=$(fetch_weather)
    NEW_WEATHER=$(jq -r '.text' <<< "$NEW_JSON")
    notify-send "Weather Updated" "$NEW_WEATHER" -a "Waybar Weather"
    pkill -RTMIN+11 waybar
    exit 0
fi

if [[ -f "$CACHE_FILE" ]]; then
    CACHE_TIME=$(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)
    TIME_DIFF=$((CURRENT_TIME - CACHE_TIME))

    if (( TIME_DIFF > UPDATE_INTERVAL )); then
        fetch_weather
    else
        CACHED_CONTENT=$(cat "$CACHE_FILE")
        if valid_weather_json "$CACHED_CONTENT"; then
            build_outputs "$CACHED_CONTENT"
        else
            fetch_weather
        fi
    fi
else
    fetch_weather
fi