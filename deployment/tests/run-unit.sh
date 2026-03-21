#!/bin/bash
# Run unit tests only (fast, no Docker required)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/colors.sh"

print_info "Running Unit Tests"
echo ""

if ! command -v bats &>/dev/null; then
    print_info "Installing bats..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &>/dev/null; then
            brew install bats-core
        else
            print_fail "Homebrew not found. Install bats manually."
            exit 1
        fi
    else
        sudo apt-get update && sudo apt-get install -y bats
    fi
fi

cd "$SCRIPT_DIR"

if [[ -d "unit" ]] && ls unit/*.bats &>/dev/null; then
    bats unit/*.bats
    echo ""
    print_pass "Unit tests passed!"
else
    print_info "No unit tests found"
fi
