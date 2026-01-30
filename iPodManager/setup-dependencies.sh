#!/bin/bash
# Setup script for iPod Manager dependencies
# Run this script to install all required dependencies

set -e

echo "=== iPod Manager Dependency Setup ==="
echo ""

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add to PATH for Apple Silicon
    if [[ $(uname -m) == "arm64" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "✓ Homebrew found"
fi

echo ""
echo "Installing dependencies..."

# Install required packages
brew install glib libplist sqlite3 pkg-config autoconf automake libtool

echo ""
echo "✓ All dependencies installed"
echo ""
echo "Now run: ./build-libgpod.sh"
