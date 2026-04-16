#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OMARCHY_CONFIGS_DIR="$SCRIPT_DIR/linux_config/omarchy_configs"

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

copy_path "$OMARCHY_CONFIGS_DIR/bin" "$OMARCHY_BASE/bin"
copy_path "$OMARCHY_CONFIGS_DIR/hypr" "$HOME/.config/hypr"
copy_path "$OMARCHY_CONFIGS_DIR/mako/core.ini" "$OMARCHY_BASE/default/mako/core.ini"
copy_path "$OMARCHY_CONFIGS_DIR/swayosd" "$HOME/.config/swayosd"
copy_path "$OMARCHY_CONFIGS_DIR/walker/config.toml" "$HOME/.config/walker/config.toml"
copy_path "$OMARCHY_CONFIGS_DIR/walker/themes/omarchy-default" "$OMARCHY_BASE/default/walker/themes/omarchy-default"
copy_path "$SCRIPT_DIR/linux_config/omarchy_configs/default/hypr/autostart.conf" "$OMARCHY_BASE/default/hypr/autostart.conf"

echo "Set power profile based on source switching (AC or Battery)"

source "$OMARCHY_PATH/install/config/powerprofilesctl-rules.sh"
