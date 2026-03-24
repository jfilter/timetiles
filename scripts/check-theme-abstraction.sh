#!/usr/bin/env bash
# Ensures no hardcoded theme colors leak into component or app code.
# Run as part of CI to prevent regressions after the theme abstraction refactor.
#
# Exit codes:
#   0 = clean
#   1 = violations found
set -euo pipefail

ERRORS=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "Checking theme abstraction..."

# --- Check 1: cartographic-* Tailwind classes in component/app code ---
# Allowed in: CSS files, comments, JSDoc, chart-themes.ts (base palette definition),
#             generate-map-style.ts (build script), global-error.tsx (crash fallback),
#             email templates, test files, payload-types.ts
CARTOGRAPHIC_HITS=$(grep -rn "cartographic-" \
  "$ROOT/packages/ui/src/components/" \
  "$ROOT/apps/web/components/" \
  "$ROOT/apps/web/app/" \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  2>/dev/null \
  | grep -v "global-error\|generate-map\|\.test\.\|test/" \
  | grep -E "(bg|text|border|from|to|via|ring|hover|focus|dark|after|before)-cartographic" \
  || true)

if [ -n "$CARTOGRAPHIC_HITS" ]; then
  echo -e "${RED}FAIL: cartographic-* Tailwind classes found in components:${NC}"
  echo "$CARTOGRAPHIC_HITS"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 2: Hardcoded OKLCH values in .tsx/.ts files (not CSS) ---
OKLCH_HITS=$(grep -rn "oklch(" \
  "$ROOT/packages/ui/src/components/" \
  "$ROOT/packages/ui/src/hooks/" \
  "$ROOT/packages/ui/src/lib/" \
  "$ROOT/apps/web/components/" \
  "$ROOT/apps/web/app/" \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  2>/dev/null \
  | grep -v "global-error\|generate-map\|\.test\.\|test/\|\.css\|// \|/\*\| \* " \
  || true)

if [ -n "$OKLCH_HITS" ]; then
  echo -e "${RED}FAIL: Hardcoded OKLCH values found in TypeScript files:${NC}"
  echo "$OKLCH_HITS"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 3: defaultColors.* usage outside allowed files ---
# Allowed in: chart-themes.ts (definition), generate-map-style.ts (build script)
DEFAULTCOLORS_HITS=$(grep -rn "defaultColors\." \
  "$ROOT/packages/ui/src/components/" \
  "$ROOT/packages/ui/src/hooks/" \
  "$ROOT/apps/web/components/" \
  "$ROOT/apps/web/app/" \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  2>/dev/null \
  | grep -v "\.test\.\|test/" \
  || true)

if [ -n "$DEFAULTCOLORS_HITS" ]; then
  echo -e "${RED}FAIL: defaultColors.* used directly in components (use ChartTheme/MapColors instead):${NC}"
  echo "$DEFAULTCOLORS_HITS"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 4: Hardcoded hex color values in component files ---
# Catches #f8f5f0, #404040, #4a5568, #0089a7, #cd853f, #5f9e6e, #e8e4dd (cartographic palette hex)
HEX_HITS=$(grep -rn '"#f8f5f0\|"#404040\|"#4a5568\|"#0089a7\|"#cd853f\|"#5f9e6e\|"#e8e4dd\|"#8b4513\|"#b06c2e\|"#f5e6d3\|"#e8c9a0' \
  "$ROOT/packages/ui/src/components/" \
  "$ROOT/apps/web/components/" \
  "$ROOT/apps/web/app/" \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  2>/dev/null \
  | grep -v "global-error\|\.test\.\|test/" \
  || true)

if [ -n "$HEX_HITS" ]; then
  echo -e "${RED}FAIL: Hardcoded cartographic hex values found in components:${NC}"
  echo "$HEX_HITS"
  ERRORS=$((ERRORS + 1))
fi

# --- Result ---
if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo -e "${RED}Theme abstraction check failed with $ERRORS violation(s).${NC}"
  echo -e "${YELLOW}Components must use semantic tokens (bg-primary, text-foreground, etc.)${NC}"
  echo -e "${YELLOW}Charts must use ChartTheme via useChartTheme() hook${NC}"
  echo -e "${YELLOW}Maps must use MapColors via useMapColors() hook${NC}"
  exit 1
else
  echo -e "${GREEN}Theme abstraction check passed.${NC}"
  exit 0
fi
