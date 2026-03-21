#!/bin/bash
# Shared color and print functions for deployment test scripts

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  $1${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo ""
}

print_pass() { echo -e "${GREEN}✓${NC} $1"; }
print_fail() { echo -e "${RED}✗${NC} $1"; }
print_info() { echo -e "${YELLOW}▶${NC} $1"; }
