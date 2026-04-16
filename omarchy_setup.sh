#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$OMARCHY_PATH" ]; then
    echo "OMARCHY_PATH is not set" >&2
    exit 1
fi

OMARCHY_BASE="${OMARCHY_PATH%/}"

copy_path() {
    local source_path="$1"
    local dest_path="$2"
    local resolved_source

    resolved_source="$(realpath "$source_path")"

    if [ -d "$resolved_source" ]; then
        mkdir -p "$dest_path"
        cp -r "$resolved_source"/. "$dest_path"/
        echo "Copied files from $resolved_source to $dest_path"
        return
    fi

    mkdir -p "$(dirname "$dest_path")"
    cp "$resolved_source" "$dest_path"
    echo "Copied file from $resolved_source to $dest_path"
}

copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/bin" "$OMARCHY_BASE/bin"
copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/hypr" "$HOME/.config/hypr"
copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/mako/core.ini" "$OMARCHY_BASE/default/mako/core.ini"
copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/swayosd" "$HOME/.config/swayosd"
copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/walker/config.toml" "$HOME/.config/walker/config.toml"
copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/walker/themes/omarchy-default" "$OMARCHY_BASE/default/walker/themes/omarchy-default"

echo "Set power profile based on source switching (AC or Battery)"

source "$OMARCHY_PATH/install/config/powerprofilesctl-rules.sh"
