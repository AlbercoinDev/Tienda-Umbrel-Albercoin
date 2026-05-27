#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Onion Rotator - Dev Environment ==="

cd "$APP_DIR"

echo "Starting dev server..."
export ONION_ROTATOR_DRY_RUN="${ONION_ROTATOR_DRY_RUN:-true}"
export ONION_ROTATOR_DEBUG="${ONION_ROTATOR_DEBUG:-true}"
export UMBREL_ROOT="${UMBREL_ROOT:-/home/umbrel/umbrel}"

# Create a mock tor data dir for testing if it doesn't exist
MOCK_TOR_DIR="/tmp/onion-rotator-dev-tor"
if [ ! -d "$MOCK_TOR_DIR" ]; then
    mkdir -p "$MOCK_TOR_DIR"
    for app in bitcoin electrs lnd cln; do
        mkdir -p "$MOCK_TOR_DIR/app-$app"
        printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion\n' > "$MOCK_TOR_DIR/app-$app/hostname"
    done
    echo "Created mock tor data at $MOCK_TOR_DIR"
fi

export TOR_DATA_DIR="$MOCK_TOR_DIR"

python src/main.py
