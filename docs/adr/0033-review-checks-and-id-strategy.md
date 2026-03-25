# ADR 0033: Data Quality Review Checks and ID Strategy Simplification

## Status

Implemented

## Context

The import pipeline had two issues:

1. **Silent data quality problems**: Imports with no timestamp field, no location field, high empty row rates, or high row error rates completed without warning. Users discovered missing data only after the import finished.

2. **Broken duplicate detection**: The `auto` ID strategy generated random `uniqueId` values per row. The `contentHash` was computed but never used for comparison. This meant duplicate detection was completely non-functional for the default strategy — re-importing the same file created duplicate events.

Additionally, the 4 ID strategies (`external`, `computed`, `auto`, `hybrid`) had overlapping purposes and the `hybrid` strategy added complexity for a niche use case.

## Decision

### Part 1: Configurable review checks

Add 8 NEEDS_REVIEW checks that pause the import pipeline for human review:

| Check               | Default threshold | When                                                                 |
| ------------------- | ----------------- | -------------------------------------------------------------------- |
| `no-timestamp`      | Boolean           | After schema detection — no date/time column found                   |
| `no-location`       | Boolean           | After schema detection — no location/address/coordinate column found |
| `high-empty-rows`   | >20%              | After schema detection — too many blank rows                         |
| `high-duplicates`   | >80%              | After duplicate analysis — most rows are duplicates                  |
| `high-row-errors`   | >10%              | After event creation — too many rows failed                          |
| `geocoding-partial` | >50%              | After geocoding — too many addresses couldn't be geocoded            |
| `quota-exceeded`    | Per user quota    | After duplicate analysis — would exceed event limits                 |
| `schema-drift`      | Boolean           | After schema validation — breaking schema changes detected           |

**Configuration layers:**

- Global thresholds in `timetiles.yml` → `reviewThresholds`
- Per-source overrides on `scheduled-ingests.advancedOptions.reviewChecks` and `scrapers.reviewChecks` with skip flags and custom thresholds

**Approval flow:**

- User sees a ReviewPanel in the import wizard with contextual details and actions
- For `no-timestamp`/`no-location`: column picker dropdown to fix the mapping, or "continue without"
- Approval sets a skip flag on the ingest file's `processingOptions` so the check doesn't re-trigger on resume
- `high-row-errors` is accept-only (events already exist, no re-run)
- `quota-exceeded` requires admin approval

### Part 2: ID strategy simplification (4 → 3)

| Strategy        | ID generation                               | Dedup    | Use case                                     |
| --------------- | ------------------------------------------- | -------- | -------------------------------------------- |
| `external`      | From a field in source data                 | Works    | Data with stable unique IDs                  |
| `content-hash`  | SHA-256 of all fields (optional exclusions) | Works    | Default — identical rows produce the same ID |
| `auto-generate` | Random unique ID per row                    | Disabled | Every row is a new event, no dedup           |

**Key rules:**

- `content-hash` is the new default (replaces `auto`)
- `auto-generate` + dedup enabled = not allowed (enforced in UI and hooks)
- `hybrid` removed (users pick one strategy)
- Migration maps: `auto` → `content-hash`, `computed` → `content-hash`, `hybrid` → `external`

## Consequences

### Positive

- Imports no longer silently produce events without timestamps or locations
- Duplicate detection works by default (content-hash produces deterministic IDs)
- Scheduled imports and scrapers can configure which checks to skip (prevents unattended imports from blocking)
- Users get actionable review UI with column picker instead of being dumped into the admin panel
- Simpler mental model: 3 strategies instead of 4

### Negative

- Existing datasets with `auto` strategy will now detect duplicates on re-import (previously they didn't). This is correct behavior but may surprise users who relied on the broken behavior.
- The `hybrid` strategy is removed. Any datasets using it are migrated to `external`.

### Neutral

- The `computedIdFields` field on datasets is kept for backward compatibility but hidden in the UI. Content-hash strategy hashes all fields by default (with optional `excludeFields`).

## Related

- ADR 0003: Data Architecture (superseded ID strategy section)
- ADR 0004: Import Pipeline
- ADR 0030: Import Workflow Migration
