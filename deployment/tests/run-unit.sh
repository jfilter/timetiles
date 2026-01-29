#!/bin/bash
# Run unit tests only (fast, no Docker required)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Running Unit Tests ===${NC}"
echo ""

# Check for bats
if ! command -v bats &>/dev/null; then
    echo -e "${YELLOW}Installing bats...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &>/dev/null; then
            brew install bats-core
        else
            echo -e "${RED}Error: Homebrew not found. Install bats manually.${NC}"
            exit 1
        fi
    else
        # Linux (Ubuntu/Debian)
        sudo apt-get update && sudo apt-get install -y bats
    fi
fi

# Run unit tests
cd "$SCRIPT_DIR"

if [[ -d "unit" ]] && ls unit/*.bats &>/dev/null; then
    bats unit/*.bats
    echo ""
    echo -e "${GREEN}Unit tests passed!${NC}"
else
    echo -e "${YELLOW}No unit tests found${NC}"
fi
