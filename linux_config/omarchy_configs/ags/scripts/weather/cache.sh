ensure_storage() {
    mkdir -p "$(dirname "$STATE_FILE")" "$CACHE_DIR"
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
