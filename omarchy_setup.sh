# 
#!/bin/bash

# Define source and destination directories
SOURCE_DIR="$(dirname "$0")/linux_config/omarchy_configs/bin"
SOURCE_DIR="$(realpath "$SOURCE_DIR")"
DEST_DIR="$HOME/.local/share/omarchy/bin"

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Copy all *.sh files from source to destination, overwriting if necessary
cp -r "$SOURCE_DIR"/* "$DEST_DIR"/

echo "Copied files from $SOURCE_DIR to $DEST_DIR"