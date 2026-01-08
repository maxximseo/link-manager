#!/bin/bash
# Build WordPress plugin ZIP with correct folder structure
# The ZIP must contain link-manager-widget/ folder (not wordpress-plugin/)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/wordpress-plugin"
BUILD_DIR="$SCRIPT_DIR/backend/build"
TEMP_DIR="/tmp/lmw-build-$$"
ZIP_NAME="link-manager-widget.zip"

echo "📦 Building Link Manager Widget Pro plugin..."

# Create temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy plugin files with correct folder name
cp -r "$PLUGIN_DIR" "$TEMP_DIR/link-manager-widget"

# Remove any .DS_Store files
find "$TEMP_DIR" -name ".DS_Store" -delete

# Create ZIP
cd "$TEMP_DIR"
rm -f "$BUILD_DIR/$ZIP_NAME"
zip -r "$BUILD_DIR/$ZIP_NAME" link-manager-widget/

# Cleanup
rm -rf "$TEMP_DIR"

echo "✅ Plugin ZIP created: $BUILD_DIR/$ZIP_NAME"
echo ""
echo "ZIP contents:"
unzip -l "$BUILD_DIR/$ZIP_NAME"
