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

# A hard ceiling on the whole suite. The individual helpers bound their own
# calls, but a run can also hang *between* tests: a daemon that inherits BATS's
# stdin pipe keeps the runner waiting for an EOF long after the last assertion
# has been reported. Without this the harness stalls until someone notices,
# which cost 52 minutes once. Generous enough for a cold VM, short enough to
# fail as a test failure rather than an unattended wait.
INTEGRATION_TIMEOUT="${INTEGRATION_TIMEOUT:-900}"

if [[ -d "integration" ]] && ls integration/*.bats &>/dev/null; then
    rc=0
    timeout "$INTEGRATION_TIMEOUT" bats integration/*.bats </dev/null || rc=$?
    if [[ $rc -eq 124 ]]; then
        echo ""
        print_fail "Integration tests exceeded ${INTEGRATION_TIMEOUT}s and were killed"
        echo "A test hung, or a spawned daemon is holding the runner's pipe open."
        exit 1
    fi
    [[ $rc -eq 0 ]] || exit $rc
    echo ""
    print_pass "Integration tests passed!"
else
    print_info "No integration tests found"
fi
