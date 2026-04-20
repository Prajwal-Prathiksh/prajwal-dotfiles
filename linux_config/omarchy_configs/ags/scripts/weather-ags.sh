#!/bin/bash

set -euo pipefail

STATE_FILE="${HOME}/.config/ags/weather-state.json"
CACHE_DIR="/tmp/ags-weather"
UPDATE_INTERVAL=300

MODE="json"
FORCE_REFRESH=0
BAR_TARGET="primary"
ACTION=""
ACTION_VALUE=""
NOTICE=""
NEXT_STATE=""
CURRENT_TIME=$(date +%s)

trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

normalize_query_key() {
    local value
    value=$(trim "$1")
    value=$(tr '[:upper:]' '[:lower:]' <<< "$value")
    value=$(sed -E 's/[[:space:]]+/ /g' <<< "$value")
    printf '%s' "$value"
}

slugify() {
    local value
    value=$(normalize_query_key "$1")
    value=$(sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g' <<< "$value")
    [[ -z "$value" ]] && value="city"
    printf '%s' "$value"
}

default_state() {
    jq -cn '{
        version: 2,
        primary_id: "auto",
        cities: [
            {
                id: "auto",
                query: "auto",
                label: "Current Location",
                kind: "auto"
            }
        ]
    }'
}

save_state() {
    local state="$1"
    local tmp
    tmp=$(mktemp)
    printf '%s\n' "$state" > "$tmp"
    command mv -f "$tmp" "$STATE_FILE"
}

normalize_state() {
    local state="$1"

    if ! jq -e '.cities and (.cities | type == "array")' >/dev/null 2>&1 <<< "$state"; then
        default_state
        return
    fi

    jq -c '
        (.primary_id // "auto") as $primary
        | .version = 2
        | .cities = (
            (.cities // [])
            | map({
                id: (.id // ""),
                query: (.query // ""),
                label: (.label // ""),
                kind: (if (.kind // "") == "auto" or (.id // "") == "auto" or (.query // "") == "auto" then "auto" else "manual" end)
            })
            | map(select(.id != "" and .query != "" and .label != ""))
          )
        | .cities = (
            if any(.cities[]?; .id == "auto") then
                .cities
            else
                [{id:"auto", query:"auto", label:"Current Location", kind:"auto"}] + .cities
            end
          )
        | .cities = reduce .cities[] as $city (
            [];
            if any(.[]; .id == $city.id) then . else . + [$city] end
          )
        | .primary_id = (
            if any(.cities[]; .id == $primary) then
                $primary
            else
                "auto"
            end
          )
    ' <<< "$state"
}

ensure_storage() {
    mkdir -p "$(dirname "$STATE_FILE")" "$CACHE_DIR"
}

load_state() {
    ensure_storage

    local state
    if [[ -f "$STATE_FILE" ]]; then
        state=$(cat "$STATE_FILE")
    else
        state=$(default_state)
    fi

    state=$(normalize_state "$state")
    save_state "$state"
    printf '%s' "$state"
}

cache_weather_file() {
    printf '%s/%s.json' "$CACHE_DIR" "$1"
}

cache_time_file() {
    printf '%s/%s.time' "$CACHE_DIR" "$1"
}

cache_is_fresh() {
    local file="$1"
    [[ -f "$file" ]] || return 1
    local modified
    modified=$(stat -c %Y "$file" 2>/dev/null || echo 0)
    (( CURRENT_TIME - modified <= UPDATE_INTERVAL ))
}

valid_weather_json() {
    jq -e '.current_condition[0] and .weather[0]' >/dev/null 2>&1 <<< "$1"
}

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

encode_location() {
    jq -rn --arg value "$1" '$value | @uri'
}

weather_json_url() {
    local query="$1"
    if [[ "${query,,}" == "auto" ]]; then
        printf 'https://wttr.in?format=j1&m'
    else
        printf 'https://wttr.in/%s?format=j1&m' "$(encode_location "$query")"
    fi
}

weather_time_url() {
    local query="$1"
    if [[ "${query,,}" == "auto" ]]; then
        printf '%s' 'https://wttr.in?format=%T+%Z'
    else
        printf '%s' "https://wttr.in/$(encode_location "$query")?format=%T+%Z"
    fi
}

fetch_weather_raw() {
    local query="$1"
    curl -s -m 5 "$(weather_json_url "$query")" || true
}

fetch_time_text() {
    local query="$1"
    local response hhmm zone
    response=$(curl -s -m 3 "$(weather_time_url "$query")" || true)
    hhmm=$(grep -oE '^[0-9]{1,2}:[0-9]{2}' <<< "$response" || true)
    zone=$(grep -oE '[A-Za-z_]+/[A-Za-z_+-]+' <<< "$response" | head -n1 || true)

    if [[ -n "$hhmm" && -n "$zone" ]]; then
        printf '%s • %s' "$hhmm" "$zone"
    elif [[ -n "$hhmm" ]]; then
        printf '%s' "$hhmm"
    else
        printf ''
    fi
}

read_cached_weather() {
    local key="$1"
    local file
    file=$(cache_weather_file "$key")
    [[ -f "$file" ]] || return 0
    local raw
    raw=$(cat "$file")
    if valid_weather_json "$raw"; then
        printf '%s' "$raw"
    fi
}

read_cached_time() {
    local key="$1"
    local file
    file=$(cache_time_file "$key")
    [[ -f "$file" ]] || return 0
    cat "$file"
}

remove_city_cache() {
    local key="$1"
    rm -f "$(cache_weather_file "$key")" "$(cache_time_file "$key")"
}

refresh_city_cache() {
    local query="$1"
    local key="$2"
    local raw time_text weather_file time_file

    raw=$(fetch_weather_raw "$query")
    time_text=$(fetch_time_text "$query")
    weather_file=$(cache_weather_file "$key")
    time_file=$(cache_time_file "$key")

    if valid_weather_json "$raw"; then
        printf '%s' "$raw" > "$weather_file"
        printf '%s' "$time_text" > "$time_file"
        return 0
    fi

    return 1
}

ensure_city_cache() {
    local query="$1"
    local key="$2"
    local force="${3:-0}"
    local weather_file
    weather_file=$(cache_weather_file "$key")

    if [[ "$force" == "1" ]] || ! cache_is_fresh "$weather_file"; then
        refresh_city_cache "$query" "$key" || true
    fi
}

current_slot_from_time_text() {
    local hhmm
    hhmm=$(grep -oE '[0-9]{1,2}:[0-9]{2}' <<< "$1" | head -n1 | tr -d ':' || true)
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

offline_city_json() {
    local city_id="$1"
    local city_query="$2"
    local city_label="$3"
    local kind="$4"
    local is_auto=false
    local removable=true

    [[ "$kind" == "auto" ]] && is_auto=true
    [[ "$kind" == "auto" ]] && removable=false

    jq -cn \
        --arg id "$city_id" \
        --arg query "$city_query" \
        --arg title "$city_label" \
        --arg location "$city_label" \
        --arg icon "󰖪" \
        --arg temp_c "--" \
        --arg feels_like_c "--" \
        --arg wind_kmh "--" \
        --arg condition "Offline" \
        --arg local_time "" \
        --arg updated_at "Unavailable" \
        --arg sunrise "" \
        --arg sunset "" \
        --arg bar_text "󰖪 --" \
        --arg error "Check network or wttr.in availability." \
        --argjson removable "$removable" \
        --argjson is_auto "$is_auto" \
        '{
            id:$id,
            query:$query,
            title:$title,
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
            forecast:[],
            bar_text:$bar_text,
            removable:$removable,
            is_auto:$is_auto,
            error:$error
        }'
}

render_city_json() {
    local raw="$1"
    local local_time_text="$2"
    local city_id="$3"
    local city_query="$4"
    local city_label="$5"
    local kind="$6"
    local removable=true
    local is_auto=false

    [[ "$kind" == "auto" ]] && removable=false
    [[ "$kind" == "auto" ]] && is_auto=true

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
        | if length > 0 then join(", ") else "" end
    ' <<< "$raw")

    [[ -z "$display_location" ]] && display_location="$city_label"

    local now_slot sunrise sunset sunrise_text sunset_text current_is_night icon forecast
    now_slot=$(current_slot_from_time_text "$local_time_text")
    sunrise=$(jq -r '.weather[0].astronomy[0].sunrise // ""' <<< "$raw")
    sunset=$(jq -r '.weather[0].astronomy[0].sunset // ""' <<< "$raw")
    sunrise_text=$(format_short_time "$sunrise")
    sunset_text=$(format_short_time "$sunset")
    current_is_night=$(is_night_time "$local_time_text" "$sunrise" "$sunset")
    icon=$(weather_icon "$current_desc" "$current_is_night")
    forecast=$(build_forecast "$raw" "$now_slot")

    jq -cn \
        --arg id "$city_id" \
        --arg query "$city_query" \
        --arg title "$city_label" \
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
        --arg bar_text "${icon} ${current_temp}°C" \
        --argjson forecast "${forecast:-[]}" \
        --argjson removable "$removable" \
        --argjson is_auto "$is_auto" \
        '{
            id:$id,
            query:$query,
            title:$title,
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
            forecast:$forecast,
            bar_text:$bar_text,
            removable:$removable,
            is_auto:$is_auto
        }'
}

build_city_payload() {
    local city_json="$1"
    local force="${2:-0}"
    local city_id city_query city_label city_kind raw local_time

    city_id=$(jq -r '.id' <<< "$city_json")
    city_query=$(jq -r '.query' <<< "$city_json")
    city_label=$(jq -r '.label' <<< "$city_json")
    city_kind=$(jq -r '.kind // "manual"' <<< "$city_json")

    ensure_city_cache "$city_query" "$city_id" "$force"
    raw=$(read_cached_weather "$city_id")
    local_time=$(read_cached_time "$city_id")

    if [[ -n "$raw" ]] && valid_weather_json "$raw"; then
        render_city_json "$raw" "$local_time" "$city_id" "$city_query" "$city_label" "$city_kind"
    else
        offline_city_json "$city_id" "$city_query" "$city_label" "$city_kind"
    fi
}

state_has_id() {
    local state="$1"
    local city_id="$2"
    jq -e --arg id "$city_id" 'any(.cities[]; .id == $id)' >/dev/null 2>&1 <<< "$state"
}

state_get_city_by_id() {
    local state="$1"
    local city_id="$2"
    jq -c --arg id "$city_id" '.cities[] | select(.id == $id)' <<< "$state" | head -n1
}

state_find_duplicate_query_id() {
    local state="$1"
    local city_query="$2"
    local normalized_query
    normalized_query=$(normalize_query_key "$city_query")

    jq -r --arg query "$normalized_query" '
        .cities[]
        | select((.query | ascii_downcase | gsub("\\s+"; " ")) == $query)
        | .id
    ' <<< "$state" | head -n1
}

unique_city_id() {
    local state="$1"
    local label="$2"
    local base candidate suffix

    base=$(slugify "$label")
    candidate="$base"
    suffix=2

    while state_has_id "$state" "$candidate"; do
        candidate="${base}-${suffix}"
        suffix=$((suffix + 1))
    done

    printf '%s' "$candidate"
}

resolve_saved_city_id() {
    local state="$1"
    local selector="$2"
    [[ -z "$selector" ]] && {
        jq -r '.primary_id' <<< "$state"
        return
    }

    if state_has_id "$state" "$selector"; then
        printf '%s' "$selector"
        return
    fi

    state_find_duplicate_query_id "$state" "$selector"
}

set_primary_id() {
    local state="$1"
    local city_id="$2"
    jq -c --arg id "$city_id" '.primary_id = $id' <<< "$state"
}

action_add_city() {
    local state="$1"
    local city_query
    city_query=$(trim "$2")
    NEXT_STATE="$state"

    if [[ -z "$city_query" ]]; then
        NOTICE="Type a city name first."
        return
    fi

    if [[ "${city_query,,}" == "auto" ]]; then
        NOTICE="Current location is already pinned."
        NEXT_STATE=$(set_primary_id "$state" "auto")
        return
    fi

    local existing_id
    existing_id=$(state_find_duplicate_query_id "$state" "$city_query")
    if [[ -n "$existing_id" ]]; then
        NOTICE="That city is already saved."
        NEXT_STATE=$(set_primary_id "$state" "$existing_id")
        return
    fi

    local new_id
    new_id=$(unique_city_id "$state" "$city_query")
    if ! refresh_city_cache "$city_query" "$new_id"; then
        remove_city_cache "$new_id"
        NOTICE="Could not fetch weather for ${city_query}."
        return
    fi

    NOTICE="Added ${city_query}."
    NEXT_STATE=$(jq -c \
        --arg id "$new_id" \
        --arg query "$city_query" \
        --arg label "$city_query" \
        '
            .cities += [{id:$id, query:$query, label:$label, kind:"manual"}]
            | .primary_id = $id
        ' <<< "$state")
}

action_remove_city() {
    local state="$1"
    local selector="$2"
    local city_id
    NEXT_STATE="$state"

    city_id=$(resolve_saved_city_id "$state" "$selector")
    if [[ -z "$city_id" ]]; then
        NOTICE="That city is not saved."
        return
    fi

    if [[ "$city_id" == "auto" ]]; then
        NOTICE="Current location stays pinned."
        return
    fi

    remove_city_cache "$city_id"
    NOTICE="Removed city."
    NEXT_STATE=$(normalize_state "$(jq -c --arg id "$city_id" '.cities |= map(select(.id != $id))' <<< "$state")")
}

action_cycle_city() {
    local state="$1"
    local direction="$2"
    local next_id
    NEXT_STATE="$state"
    next_id=$(jq -r --arg direction "$direction" '
        [.cities[].id] as $ids
        | ($ids | length) as $count
        | if $count == 0 then
            ""
          else
            (.primary_id // $ids[0]) as $current
            | (($ids | index($current)) // 0) as $index
            | if $direction == "prev" then
                $ids[(($index - 1 + $count) % $count)]
              else
                $ids[(($index + 1) % $count)]
              end
          end
    ' <<< "$state")

    [[ -n "$next_id" ]] || return
    NEXT_STATE=$(set_primary_id "$state" "$next_id")
}

apply_action() {
    local state="$1"
    NEXT_STATE="$state"

    case "$ACTION" in
        add)
            action_add_city "$state" "$ACTION_VALUE"
            ;;
        remove)
            action_remove_city "$state" "$ACTION_VALUE"
            ;;
        set-primary)
            local city_id
            city_id=$(resolve_saved_city_id "$state" "$ACTION_VALUE")
            if [[ -n "$city_id" ]]; then
                NEXT_STATE=$(set_primary_id "$state" "$city_id")
            else
                NOTICE="That city is not saved."
            fi
            ;;
        cycle)
            action_cycle_city "$state" "$ACTION_VALUE"
            ;;
    esac
}

render_bundle_json() {
    local state="$1"
    local force="${2:-0}"
    local primary_id city_list primary_city

    primary_id=$(jq -r '.primary_id' <<< "$state")
    city_list='[]'

    while IFS= read -r city_json; do
        [[ -z "$city_json" ]] && continue
        local payload
        payload=$(build_city_payload "$city_json" "$force")
        city_list=$(jq -c --arg id "$primary_id" --argjson item "$payload" '
            . + [$item + {is_primary: ($item.id == $id)}]
        ' <<< "$city_list")
    done < <(jq -c '.cities[]' <<< "$state")

    primary_city=$(jq -c --arg id "$primary_id" '
        (map(select(.id == $id)) | .[0]) // .[0] // {}
    ' <<< "$city_list")

    jq -cn \
        --arg notice "$NOTICE" \
        --argjson primary "$primary_city" \
        --argjson cities "$city_list" \
        '{
            bar_text: ($primary.bar_text // "󰖪 --"),
            primary_city: $primary,
            cities: $cities
        }
        + (if ($primary.error // "") != "" then {error: $primary.error} else {} end)
        + (if $notice != "" then {notice: $notice} else {} end)'
}

render_bar_output() {
    local state="$1"
    local selected_city payload primary_id

    if [[ "$BAR_TARGET" == "current" ]]; then
        selected_city=$(state_get_city_by_id "$state" "auto")
    else
        primary_id=$(jq -r '.primary_id' <<< "$state")
        selected_city=$(state_get_city_by_id "$state" "$primary_id")
    fi

    payload=$(build_city_payload "$selected_city" "$FORCE_REFRESH")
    jq -r '.bar_text // "󰖪 --"' <<< "$payload"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --bar)
                MODE="bar"
                ;;
            --refresh)
                FORCE_REFRESH=1
                ;;
            --current)
                BAR_TARGET="current"
                ;;
            --add-city)
                ACTION="add"
                ACTION_VALUE="${2:-}"
                shift
                ;;
            --remove-city)
                ACTION="remove"
                ACTION_VALUE="${2:-}"
                shift
                ;;
            --set-primary)
                ACTION="set-primary"
                ACTION_VALUE="${2:-}"
                shift
                ;;
            --cycle)
                ACTION="cycle"
                ACTION_VALUE="${2:-next}"
                shift
                ;;
        esac
        shift
    done
}

parse_args "$@"

STATE=$(load_state)

if [[ -n "$ACTION" ]]; then
    apply_action "$STATE"
    STATE=$(normalize_state "$NEXT_STATE")
    save_state "$STATE"
fi

if [[ "$MODE" == "bar" ]]; then
    render_bar_output "$STATE"
else
    render_bundle_json "$STATE" "$FORCE_REFRESH"
fi
