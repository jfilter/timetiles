#!/bin/bash
# Run integration tests (requires Docker)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/colors.sh"

print_info "Running Integration Tests"
echo ""

if ! command -v bats &>/dev/null; then
    print_info "Installing bats..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install bats-core 2>/dev/null || true
    else
        sudo apt-get update && sudo apt-get install -y bats
    fi
fi

if ! docker info &>/dev/null; then
    print_fail "Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "postgres"; then
    print_info "Services not running. Setting up test environment..."
    "$SCRIPT_DIR/helpers/setup-test-env.sh"
fi

cd "$SCRIPT_DIR"

if [[ -d "integration" ]] && ls integration/*.bats &>/dev/null; then
    bats integration/*.bats
    echo ""
    print_pass "Integration tests passed!"
else
    print_info "No integration tests found"
fi
