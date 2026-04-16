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

time_to_minutes() {
    local input="$1"
    local normalized hour minute meridiem

    normalized=$(tr '[:lower:]' '[:upper:]' <<< "$input")

    if [[ "$normalized" =~ ([0-9]{1,2}):([0-9]{2})[[:space:]]*([AP]M) ]]; then
        hour="${BASH_REMATCH[1]}"
        minute="${BASH_REMATCH[2]}"
        meridiem="${BASH_REMATCH[3]}"
        hour=$((10#$hour))
        minute=$((10#$minute))

        if [[ "$meridiem" == "AM" ]]; then
            (( hour == 12 )) && hour=0
        else
            (( hour != 12 )) && hour=$((hour + 12))
        fi

        echo $((hour * 60 + minute))
        return
    fi

    if [[ "$normalized" =~ ([0-9]{1,2}):([0-9]{2}) ]]; then
        hour="${BASH_REMATCH[1]}"
        minute="${BASH_REMATCH[2]}"
        echo $((10#$hour * 60 + 10#$minute))
        return
    fi

    echo ""
}

slot_to_minutes() {
    local slot="${1:-0}"
    local slot_text
    slot_text=$(printf "%04d" "$slot")
    echo $((10#${slot_text:0:2} * 60 + 10#${slot_text:2:2}))
}

is_night_time() {
    local current="$1"
    local sunrise="$2"
    local sunset="$3"
    local current_minutes sunrise_minutes sunset_minutes

    current_minutes=$(time_to_minutes "$current")
    sunrise_minutes=$(time_to_minutes "$sunrise")
    sunset_minutes=$(time_to_minutes "$sunset")

    if [[ -z "$current_minutes" || -z "$sunrise_minutes" || -z "$sunset_minutes" ]]; then
        echo 0
        return
    fi

    if (( current_minutes < sunrise_minutes || current_minutes >= sunset_minutes )); then
        echo 1
    else
        echo 0
    fi
}

is_night_slot() {
    local slot="$1"
    local sunrise="$2"
    local sunset="$3"
    local slot_minutes sunrise_minutes sunset_minutes

    slot_minutes=$(slot_to_minutes "$slot")
    sunrise_minutes=$(time_to_minutes "$sunrise")
    sunset_minutes=$(time_to_minutes "$sunset")

    if [[ -z "$sunrise_minutes" || -z "$sunset_minutes" ]]; then
        case "$slot" in
            0|300|1800|2100) echo 1 ;;
            *) echo 0 ;;
        esac
        return
    fi

    if (( slot_minutes < sunrise_minutes || slot_minutes >= sunset_minutes )); then
        echo 1
    else
        echo 0
    fi
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

format_short_time() {
    local input="$1"
    local normalized hour minute meridiem

    normalized=$(tr '[:lower:]' '[:upper:]' <<< "$input")

    if [[ "$normalized" =~ ([0-9]{1,2}):([0-9]{2})[[:space:]]*([AP]M) ]]; then
        hour="${BASH_REMATCH[1]}"
        minute="${BASH_REMATCH[2]}"
        meridiem="${BASH_REMATCH[3]}"
        hour=$((10#$hour))

        if [[ "$meridiem" == "AM" ]]; then
            (( hour == 12 )) && hour=0
        else
            (( hour != 12 )) && hour=$((hour + 12))
        fi

        printf "%02d:%s" "$hour" "$minute"
        return
    fi

    if [[ "$normalized" =~ ([0-9]{1,2}):([0-9]{2}) ]]; then
        printf "%02d:%s" "$((10#${BASH_REMATCH[1]}))" "${BASH_REMATCH[2]}"
        return
    fi

    printf '%s' "$input"
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
        .weather[0] as $today
        | .weather[1] as $tomorrow
        | [
          ($today.hourly
            | map(select((.time | tonumber) > $now))
            | map({
                day_offset: 0,
                time: (.time | tonumber),
                temp: (.tempC // ""),
                desc: (.weatherDesc[0].value // ""),
                wind: (.windspeedKmph // ""),
                sunrise: ($today.astronomy[0].sunrise // ""),
                sunset: ($today.astronomy[0].sunset // "")
              })),
          ($tomorrow.hourly
            | map({
                day_offset: 1,
                time: (.time | tonumber),
                temp: (.tempC // ""),
                desc: (.weatherDesc[0].value // ""),
                wind: (.windspeedKmph // ""),
                sunrise: ($tomorrow.astronomy[0].sunrise // ""),
                sunset: ($tomorrow.astronomy[0].sunset // "")
              }))
        ]
        | add
        | .[:5]
        | .[]
    ' <<< "$raw" | while IFS= read -r row; do
        [[ -z "$row" ]] && continue
        local t temp desc wind label sunrise sunset slot_is_night icon
        t=$(jq -r '.time' <<< "$row")
        temp=$(pad_number "$(jq -r '.temp' <<< "$row")" 2)
        desc=$(short_condition "$(jq -r '.desc' <<< "$row")")
        wind=$(pad_number "$(jq -r '.wind' <<< "$row")" 2)
        sunrise=$(jq -r '.sunrise' <<< "$row")
        sunset=$(jq -r '.sunset' <<< "$row")
        label=$(part_name "$t")
        slot_is_night=$(is_night_slot "$t" "$sunrise" "$sunset")
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

    local local_time_text now_slot sunrise sunset sunrise_text sunset_text current_is_night icon forecast
    local_time_text=$(get_local_time_text)
    now_slot=$(current_slot_from_time_text "$local_time_text")
    sunrise=$(jq -r '.weather[0].astronomy[0].sunrise // ""' <<< "$raw")
    sunset=$(jq -r '.weather[0].astronomy[0].sunset // ""' <<< "$raw")
    sunrise_text=$(format_short_time "$sunrise")
    sunset_text=$(format_short_time "$sunset")
    current_is_night=$(is_night_time "$local_time_text" "$sunrise" "$sunset")
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
        --arg sunrise "$sunrise_text" \
        --arg sunset "$sunset_text" \
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
            sunrise:$sunrise,
            sunset:$sunset,
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
        sunrise:"",
        sunset:"",
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

refresh_weather() {
    local raw
    raw=$(curl -s -m 5 "$WTTR_JSON_URL" || true)

    if valid_weather_json "$raw"; then
        printf '%s' "$raw" > "$CACHE_FILE"
        render_json "$raw"
        return
    fi

    if [[ -f "$CACHE_FILE" ]]; then
        rm -f "$CACHE_FILE"
    fi

    offline_json
}

if [[ "$MODE" == "--refresh" ]]; then
    refresh_weather
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
