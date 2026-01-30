# Tooling Improvements: Vitest, Turborepo, and pnpm

**Date:** 2026-01-30
**Status:** Implemented

## Overview

Comprehensive improvements to build tooling based on official skill recommendations for Vitest, Turborepo, and pnpm. All changes follow best practices and are backward compatible.

## Motivation

Analysis using official skills (vitest, turborepo, pnpm) revealed several opportunities to improve:
- Build performance (parallel execution)
- Code quality enforcement (coverage thresholds)
- CI reproducibility (frozen lockfiles)
- Dependency management (strict peer deps)

## Changes Implemented

### 1. Turborepo Optimizations

**File:** `turbo.json`

- Added **transit node pattern** for parallel task execution
- Updated `lint`, `typecheck`, `typecheck:fast`, `lint:fast` to use transit pattern
- Added missing outputs to `typecheck:fast`

**Impact:** Lint and typecheck tasks now run in parallel (194% CPU usage observed) instead of sequentially, significantly reducing local build and CI times.

**File:** `package.json` (root)

- Replaced `turbo <task>` with `turbo run <task>` in all scripts
- Follows official Turborepo best practices (shorthand only for interactive use)

### 2. pnpm Configuration

**File:** `.npmrc` (created)

Added strict pnpm configuration:
- `auto-install-peers=false` - Prevents phantom dependencies
- `strict-peer-dependencies=true` - Fails fast on peer conflicts
- `public-hoist-pattern[]=*eslint*` and `*prettier*` - Hoists tools for plugin compatibility
- `prefer-frozen-lockfile=true` - Prefers existing lockfile
- `shamefully-hoist=false` - Maintains strict resolution

**Impact:** Prevents phantom dependencies, enforces explicit peer deps, improves tool compatibility.

### 3. CI Reproducibility

**Files:** `.github/workflows/*.yml` (4 files updated)

- Added `--frozen-lockfile` flag to all `pnpm install` commands
- Updated: `build.yml`, `check-payload-types.yml`, `test-e2e.yml`, `test-unit-integration.yml`

**Impact:** Ensures CI uses exact versions from lockfile, prevents "works on my machine" issues, fails fast if lockfile is out of sync.

### 4. Code Quality Enforcement

**File:** `apps/web/vitest.config.ts`

Added coverage thresholds matching current baseline:
```typescript
thresholds: {
  lines: 48,
  functions: 46,
  branches: 42,
  statements: 47,
}
```

**Impact:** Tests fail if coverage drops below current levels, preventing coverage regression. Can be gradually increased as coverage improves.

## Validation

- ✅ `make check-ai` - Passes (253 warnings, 0 errors)
- ✅ Parallel execution confirmed (194% CPU usage for lint+typecheck)
- ✅ Coverage thresholds working (detected current 48% coverage)
- ✅ All workflow files updated consistently

## Trade-offs Considered

### Coverage Thresholds
- Set to current baseline (48%) rather than aspirational (80%)
- Rationale: Prevent regression without breaking existing builds
- Can be increased incrementally as coverage improves

### pnpm Catalogs
- NOT implemented (deferred)
- Rationale: Most invasive change, requires updating all package.json files
- Can be added later if centralized version management becomes priority

### Transit Nodes
- Added for lint/typecheck tasks
- Does NOT affect build task (still uses `^build` for proper dependency ordering)
- Rationale: Lint/typecheck don't need build artifacts, only source code

## Migration Notes

No migration required - all changes are backward compatible:
- Existing `turbo build`, `turbo test` commands still work (just not best practice in scripts)
- pnpm behavior more strict but catches issues rather than hiding them
- Coverage thresholds match current levels
- CI lockfile enforcement prevents issues rather than causing them

## Future Improvements

1. **Increase coverage thresholds** - Gradually raise from 48% toward 80%
2. **Add pnpm catalogs** - Centralize version management for shared dependencies
3. **Optimize globalEnv** - Move task-specific env vars from globalEnv to task-level
4. **Add benchmark tests** - Track performance of critical paths

## References

- Turborepo skill: Transit nodes pattern for parallel execution
- pnpm skill: Strict peer dependencies and hoisting patterns
- Vitest skill: Coverage thresholds and V8 provider configuration
