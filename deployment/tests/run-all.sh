#!/bin/bash
# Run all deployment tests (unit + integration)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers/colors.sh"

print_header "TimeTiles Deployment Test Suite"

FAILED=0

echo -e "${YELLOW}━━━ Unit Tests ━━━${NC}"
if "$SCRIPT_DIR/run-unit.sh"; then
    print_pass "Unit tests passed"
else
    print_fail "Unit tests failed"
    FAILED=1
fi

echo ""

echo -e "${YELLOW}━━━ Integration Tests ━━━${NC}"
if "$SCRIPT_DIR/run-integration.sh"; then
    print_pass "Integration tests passed"
else
    print_fail "Integration tests failed"
    FAILED=1
fi

echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"

if [[ $FAILED -eq 0 ]]; then
    print_pass "All tests passed!"
    exit 0
else
    print_fail "Some tests failed"
    exit 1
fi
