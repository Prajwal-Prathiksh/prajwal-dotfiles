default_state() {
    jq -cn '{
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
    jq '.' <<< "$state" > "$tmp"
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
        ACTION_STATUS="empty"
        return
    fi

    if [[ "${city_query,,}" == "auto" ]]; then
        NOTICE="Current location is already pinned."
        ACTION_STATUS="set-primary"
        ACTION_CITY_ID="auto"
        NEXT_STATE=$(set_primary_id "$state" "auto")
        return
    fi

    local existing_id
    existing_id=$(state_find_duplicate_query_id "$state" "$city_query")
    if [[ -n "$existing_id" ]]; then
        NOTICE="That city is already saved."
        ACTION_STATUS="already-saved"
        ACTION_CITY_ID="$existing_id"
        NEXT_STATE=$(set_primary_id "$state" "$existing_id")
        return
    fi

    local new_id
    new_id=$(unique_city_id "$state" "$city_query")
    if ! refresh_city_cache "$city_query" "$new_id"; then
        remove_city_cache "$new_id"
        NOTICE="Could not fetch weather for ${city_query}."
        ACTION_STATUS="fetch-failed"
        return
    fi

    NOTICE="Added ${city_query}."
    ACTION_STATUS="added"
    ACTION_CITY_ID="$new_id"
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
        ACTION_STATUS="missing"
        return
    fi

    if [[ "$city_id" == "auto" ]]; then
        NOTICE="Current location stays pinned."
        ACTION_STATUS="kept-auto"
        ACTION_CITY_ID="auto"
        return
    fi

    remove_city_cache "$city_id"
    NOTICE="Removed city."
    ACTION_STATUS="removed"
    ACTION_CITY_ID="$city_id"
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
    ACTION_STATUS="cycled"
    ACTION_CITY_ID="$next_id"
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
                ACTION_STATUS="set-primary"
                ACTION_CITY_ID="$city_id"
            else
                NOTICE="That city is not saved."
                ACTION_STATUS="missing"
            fi
            ;;
        cycle)
            action_cycle_city "$state" "$ACTION_VALUE"
            ;;
    esac
}
