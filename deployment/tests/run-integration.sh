#!/bin/bash
# Run integration tests (requires Docker)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Running Integration Tests ===${NC}"
echo ""

# Check for bats
if ! command -v bats &>/dev/null; then
    echo -e "${YELLOW}Installing bats...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install bats-core 2>/dev/null || true
    else
        sudo apt-get update && sudo apt-get install -y bats
    fi
fi

# Check Docker
if ! docker info &>/dev/null; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if services are running
if ! docker ps --format '{{.Names}}' | grep -q "postgres"; then
    echo -e "${YELLOW}Services not running. Setting up test environment...${NC}"
    "$SCRIPT_DIR/helpers/setup-test-env.sh"
fi

# Run integration tests
cd "$SCRIPT_DIR"

if [[ -d "integration" ]] && ls integration/*.bats &>/dev/null; then
    bats integration/*.bats
    echo ""
    echo -e "${GREEN}Integration tests passed!${NC}"
else
    echo -e "${YELLOW}No integration tests found${NC}"
fi
