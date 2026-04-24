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
        | .[:4]
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
        --arg action_status "$ACTION_STATUS" \
        --arg action_city_id "$ACTION_CITY_ID" \
        --argjson primary "$primary_city" \
        --argjson cities "$city_list" \
        '{
            bar_text: ($primary.bar_text // "󰖪 --"),
            primary_city: $primary,
            cities: $cities
        }
        + (if ($primary.error // "") != "" then {error: $primary.error} else {} end)
        + (if $notice != "" then {notice: $notice} else {} end)
        + (if $action_status != "" then {action_status: $action_status} else {} end)
        + (if $action_city_id != "" then {action_city_id: $action_city_id} else {} end)'
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
