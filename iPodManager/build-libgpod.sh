#!/bin/bash
# Build libgpod for Apple Silicon (arm64)
# Run this after setup-dependencies.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIBGPOD_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Building libgpod for arm64 ==="
echo "Source directory: $LIBGPOD_DIR"
echo ""

cd "$LIBGPOD_DIR"

# Ensure Homebrew is in PATH
if [[ $(uname -m) == "arm64" ]] && [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Check for required tools
if ! command -v pkg-config &> /dev/null; then
    echo "ERROR: pkg-config not found. Run setup-dependencies.sh first."
    exit 1
fi

echo "Dependencies found:"
echo "  glib: $(pkg-config --modversion glib-2.0 2>/dev/null || echo 'not found')"
echo "  libplist: $(pkg-config --modversion libplist-2.0 2>/dev/null || echo 'not found')"
echo ""

# Run autogen if configure doesn't exist
if [[ ! -f configure ]]; then
    echo "Running autogen.sh..."
    ./autogen.sh
fi

# Configure for arm64
echo "Configuring for arm64..."
./configure \
    --prefix=/usr/local \
    CFLAGS="-arch arm64 -I/opt/homebrew/include" \
    LDFLAGS="-arch arm64 -L/opt/homebrew/lib" \
    PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig"

# Build
echo ""
echo "Building..."
make -j$(sysctl -n hw.ncpu)

echo ""
echo "=== Build complete ==="
echo ""
echo "To install (requires sudo):"
echo "  sudo make install"
echo ""
echo "Library will be installed to:"
echo "  /usr/local/lib/libgpod.dylib"
echo "  /usr/local/include/gpod-1.0/"
