#!/bin/bash
# Run all deployment tests (unit + integration)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   TimeTiles Deployment Test Suite      ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo ""

# Track failures
FAILED=0

# Run unit tests
echo -e "${YELLOW}━━━ Unit Tests ━━━${NC}"
if "$SCRIPT_DIR/run-unit.sh"; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo -e "${RED}✗ Unit tests failed${NC}"
    FAILED=1
fi

echo ""

# Run integration tests
echo -e "${YELLOW}━━━ Integration Tests ━━━${NC}"
if "$SCRIPT_DIR/run-integration.sh"; then
    echo -e "${GREEN}✓ Integration tests passed${NC}"
else
    echo -e "${RED}✗ Integration tests failed${NC}"
    FAILED=1
fi

echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
