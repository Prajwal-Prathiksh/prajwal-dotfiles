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
