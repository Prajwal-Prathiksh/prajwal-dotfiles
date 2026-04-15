#!/bin/bash

set -euo pipefail

LOCATION="auto"
CACHE_FILE="/tmp/ags_weather.cache"
UPDATE_INTERVAL=300
MODE="${1:-}"
CURRENT_TIME=$(date +%s)

if [[ "${LOCATION,,}" == "auto" ]]; then
    WTTR_JSON_URL="https://wttr.in?format=j1&m"
    WTTR_TIME_URL="https://wttr.in?format=%T+%Z"
else
    WTTR_JSON_URL="https://wttr.in/${LOCATION}?format=j1&m"
    WTTR_TIME_URL="https://wttr.in/${LOCATION}?format=%T+%Z"
fi

is_night_slot() {
    case "$1" in
        0|300|1800|2100) echo 1 ;;
        *) echo 0 ;;
    esac
}

weather_icon() {
    local desc="${1,,}"
    local is_night="${2:-0}"

    if [[ "$is_night" == "1" ]]; then
        case "$desc" in
            *clear*) echo "🌕️" ;;
            *partly\ cloudy*|*cloudy*|*overcast*) echo "☁️" ;;
            *mist*|*fog*) echo "🌫️" ;;
            *rain*|*drizzle*|*patchy\ rain*) echo "🌧️" ;;
            *thunder*|*storm*) echo "⛈️" ;;
            *snow*|*sleet*|*ice*) echo "❄️" ;;
            *wind*) echo "🌪️" ;;
            *) echo "🌕️" ;;
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
            *wind*) echo "🌪️" ;;
            *) echo "🌤️" ;;
        esac
    fi
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

pad_number() {
    local val="$1"
    local width="${2:-2}"
    [[ -z "$val" ]] && { printf '%s' "$val"; return; }
    if [[ "$val" == *.* ]]; then
        local intpart="${val%%.*}"
        local fracpart="${val#*.}"
        [[ -z "$intpart" ]] && intpart=0
        printf "%0*d.%s" "$width" "$intpart" "$fracpart"
    elif [[ "$val" =~ ^-?[0-9]+$ ]]; then
        printf "%0*d" "$width" "$val"
    else
        printf '%s' "$val"
    fi
}

valid_weather_json() {
    jq -e '.current_condition[0] and .weather[0]' >/dev/null 2>&1 <<< "$1"
}

get_local_time_text() {
    local t hhmm zone
    t=$(curl -s -m 3 "$WTTR_TIME_URL" || true)
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
    local hhmm
    hhmm=$(grep -oE '[0-9]{1,2}:[0-9]{2}' <<< "$1" | head -n1 | tr -d ':')
    [[ -z "$hhmm" ]] && hhmm=1200
    hhmm=$((10#$hhmm))
    if (( hhmm < 300 )); then echo 0
    elif (( hhmm < 600 )); then echo 300
    elif (( hhmm < 900 )); then echo 600
    elif (( hhmm < 1200 )); then echo 900
    elif (( hhmm < 1500 )); then echo 1200
    elif (( hhmm < 1800 )); then echo 1500
    elif (( hhmm < 2100 )); then echo 1800
    else echo 2100
    fi
}

build_forecast() {
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
        | .[:5]
        | .[]
    ' <<< "$raw" | while IFS= read -r row; do
        [[ -z "$row" ]] && continue
        local t temp desc wind label slot_is_night icon
        t=$(jq -r '.time' <<< "$row")
        temp=$(pad_number "$(jq -r '.temp' <<< "$row")" 2)
        desc=$(short_condition "$(jq -r '.desc' <<< "$row")")
        wind=$(pad_number "$(jq -r '.wind' <<< "$row")" 2)
        label=$(part_name "$t")
        slot_is_night=$(is_night_slot "$t")
        icon=$(weather_icon "$desc" "$slot_is_night")
        jq -cn \
            --arg label "$label" \
            --arg icon "$icon" \
            --arg temp "${temp}°C" \
            --arg wind "${wind} km/h" \
            --arg desc "$desc" \
            '{label:$label, icon:$icon, temp:$temp, wind:$wind, desc:$desc}'
    done | jq -s '.'
}

render_json() {
    local raw="$1"
    local current_temp current_desc current_wind current_feels display_location
    current_temp=$(pad_number "$(jq -r '.current_condition[0].temp_C // ""' <<< "$raw")" 2)
    current_desc=$(short_condition "$(jq -r '.current_condition[0].weatherDesc[0].value // ""' <<< "$raw")")
    current_wind=$(pad_number "$(jq -r '.current_condition[0].windspeedKmph // ""' <<< "$raw")" 2)
    current_feels=$(pad_number "$(jq -r '.current_condition[0].FeelsLikeC // ""' <<< "$raw")" 2)
    display_location=$(jq -r '
        [
            .nearest_area[0].areaName[0].value,
            .nearest_area[0].region[0].value
        ]
        | map(select(. != null and . != ""))
        | if length > 0 then join(", ") else "Current Location" end
    ' <<< "$raw")

    local local_time_text now_slot current_is_night icon forecast
    local_time_text=$(get_local_time_text)
    now_slot=$(current_slot_from_time_text "$local_time_text")
    current_is_night=$(is_night_slot "$now_slot")
    icon=$(weather_icon "$current_desc" "$current_is_night")
    forecast=$(build_forecast "$raw" "$now_slot")

    jq -cn \
        --arg bar_text "${icon} ${current_temp}°C" \
        --arg location "$display_location" \
        --arg icon "$icon" \
        --arg temp_c "${current_temp}°C" \
        --arg feels_like_c "${current_feels}°C" \
        --arg wind_kmh "${current_wind} km/h" \
        --arg condition "$current_desc" \
        --arg local_time "$local_time_text" \
        --arg updated_at "${local_time_text:-Just now}" \
        --argjson forecast "${forecast:-[]}" \
        '{
            bar_text:$bar_text,
            location:$location,
            icon:$icon,
            temp_c:$temp_c,
            feels_like_c:$feels_like_c,
            wind_kmh:$wind_kmh,
            condition:$condition,
            local_time:$local_time,
            updated_at:$updated_at,
            forecast:$forecast
        }'
}

offline_json() {
    jq -cn '{
        bar_text:"󰖪 --",
        location:"Weather unavailable",
        icon:"󰖪",
        temp_c:"--",
        feels_like_c:"--",
        wind_kmh:"--",
        condition:"Offline",
        local_time:"",
        updated_at:"Unavailable",
        forecast:[],
        error:"Check network or wttr.in availability."
    }'
}

fetch_weather() {
    local raw
    raw=$(curl -s -m 5 "$WTTR_JSON_URL" || true)
    if valid_weather_json "$raw"; then
        printf '%s' "$raw" > "$CACHE_FILE"
        render_json "$raw"
        return
    fi
    if [[ -f "$CACHE_FILE" ]]; then
        local cached
        cached=$(cat "$CACHE_FILE")
        if valid_weather_json "$cached"; then
            render_json "$cached"
            return
        fi
    fi
    offline_json
}

if [[ "$MODE" == "--refresh" ]]; then
    fetch_weather
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
            render_json "$CACHED_CONTENT"
        else
            fetch_weather
        fi
    fi
else
    fetch_weather
fi
