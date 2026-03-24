#!/usr/bin/env bash
# Check for CVA variant issues:
# 1. Multiple options in a group with identical values (dead variants)
# 2. All options in a group are empty strings (phantom variant group)
#
# Usage: ./scripts/check-cva-variants.sh [directory]
# Default directory: packages/ui/src

set -euo pipefail

dir="${1:-packages/ui/src}"

node --input-type=module -e "
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const dir = process.argv[1];
let hasErrors = false;

function walk(d) {
  for (const entry of readdirSync(d)) {
    const p = join(d, entry);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.tsx') && !p.endsWith('.ts')) continue;

    const src = readFileSync(p, 'utf8');
    const cvaRegex = /cva\([^)]*\{[\s\S]*?variants:\s*\{([\s\S]*?)\}\s*,\s*(?:compoundVariants|defaultVariants)/g;
    let match;
    while ((match = cvaRegex.exec(src)) !== null) {
      const variantsBlock = match[1];
      const groupRegex = /(\w[\w-]*):\s*\{([^}]+)\}/g;
      let group;
      while ((group = groupRegex.exec(variantsBlock)) !== null) {
        const groupName = group[1];
        const entries = group[2];
        const kvRegex = /[\"']?([\w-]+)[\"']?\s*:\s*\"([^\"]*)\"/g;
        const values = new Map();
        const allValues = [];
        let kv;
        while ((kv = kvRegex.exec(entries)) !== null) {
          const [, key, value] = kv;
          allValues.push(value);
          // Check 1: duplicate values
          if (values.has(value)) {
            const relPath = p.replace(process.cwd() + '/', '');
            console.error(
              \`\x1b[31merror\x1b[0m: \${relPath} — variant \"\${groupName}\": \"\${key}\" and \"\${values.get(value)}\" have identical value \"\${value || '(empty)'}\"\`
            );
            hasErrors = true;
          } else {
            values.set(value, key);
          }
        }
        // Check 2: all values empty (phantom variant group)
        if (allValues.length > 1 && allValues.every(v => v === '')) {
          const relPath = p.replace(process.cwd() + '/', '');
          console.error(
            \`\x1b[31merror\x1b[0m: \${relPath} — variant \"\${groupName}\": all \${allValues.length} options are empty strings (phantom variant)\`
          );
          hasErrors = true;
        }
      }
    }
  }
}

walk(dir);
process.exit(hasErrors ? 1 : 0);
" "$dir"
