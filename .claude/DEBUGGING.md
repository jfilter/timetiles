# Debugging Guide

> Detailed debugging patterns for common issues. **Only read this file when actively troubleshooting.**

## Log Locations

| Log Type | Location |
|----------|----------|
| Dev server | Terminal running `make dev` |
| Database | `make db-logs` (respects `PG_MODE` in `.env`) |
| Test results | `apps/web/.test-results/` (timestamped JSON files) |
| Payload jobs | `/dashboard/payload-jobs` in browser |

## Import Pipeline Debugging

### Stage Flow

```
UPLOAD → SCHEMA_DETECTION → AWAITING_APPROVAL → VALIDATION → GEOCODING → PROCESSING → COMPLETED
```

### Common Stuck States

| Symptom | Cause | Fix |
|---------|-------|-----|
| Job stuck in SCHEMA_DETECTION | Background job failed | Check `payload-jobs` for errors, run `await payload.jobs.run()` |
| Job stuck in AWAITING_APPROVAL | Normal - waiting for user | Approve schema in UI or via API |
| Job stuck in GEOCODING | Rate limit or API error | Check logs, retry with `make db-shell` to update stage |
| Job stuck in PROCESSING | Large batch timeout | Check batch size, consider chunking |

### Inspecting Job Queue

```typescript
// Find pending jobs for an import
const jobs = await payload.find({
  collection: 'payload-jobs',
  where: {
    'input.importJobId': { equals: importJobId },
    completedAt: { exists: false },
  },
});
```

**Important:** Jobs auto-delete on completion (`deleteJobOnComplete: true`). Query pending jobs BEFORE running them.

## Database/PostGIS Issues

### Migration Failures

```bash
# Check current migration state
make db-shell
\dt payload_migrations

# Reset and re-run (destructive)
make db-reset
pnpm payload:migrate
```

### PostGIS Function Errors

```bash
# Verify PostGIS is installed
make db-shell
SELECT PostGIS_Version();

# Check available functions
\df ST_*
```

### Connection Problems

```bash
# Check environment status
make status

# Reset database (respects PG_MODE)
make db-reset

# Check logs (respects PG_MODE)
make db-logs
```

## Test Debugging

### Reading Test Results

```bash
# Show failed tests (uses latest result file)
cat apps/web/.test-results/$(ls -t apps/web/.test-results/ | head -1) | jq '.testResults[] | select(.status=="failed") | .name'

# Show failure messages
cat apps/web/.test-results/$(ls -t apps/web/.test-results/ | head -1) | jq '.testResults[] | select(.status=="failed") | .message'
```

### Job Auto-Deletion Gotcha

See `apps/web/tests/integration/CLAUDE.md` for detailed patterns. Key point: verify jobs exist BEFORE running them, then check side effects (not job records) after.

### Flaky Test Patterns

| Pattern | Cause | Fix |
|---------|-------|-----|
| Works alone, fails in suite | Shared state pollution | Use `describe.sequential()` or better isolation |
| Random timeout failures | Slow CI, race conditions | Increase timeout, add explicit waits |
| "relation does not exist" | Migration not run | `make db-reset` before tests |

## Build/Type Errors

### After Schema Changes

```bash
# Full rebuild flow
pnpm payload:migrate:create    # Generate migration
pnpm payload:migrate           # Apply migration
make check-ai PACKAGE=web      # Verify types
```

### Cross-Package Issues

```bash
# Rebuild UI package (if web has type errors from UI changes)
cd packages/ui && pnpm build

# Full clean rebuild
make fresh
make check-ai
```

### Common Type Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot find module" | Package not built | `pnpm build` in the package |
| "Type X is not assignable" | Schema out of sync | Regenerate types with `pnpm payload:migrate:create` |
| Import errors after rename | Stale cache | Delete `.next/` and restart |

## Scraper Debugging

### Runner not reachable
- Check `SCRAPER_RUNNER_URL` and `SCRAPER_API_KEY` in `.env`
- Verify runner is running: `curl http://localhost:4000/health`

### Container execution fails
- Verify Podman is installed: `podman --version`
- Check rootless mode: `podman info --format '{{.Host.Security.Rootless}}'`
- Verify base images built: `podman images | grep timescrape`
- Check sandbox network: `podman network ls | grep scraper-sandbox`

### Scraper output validation errors
- Output must be valid CSV with a header row
- Max size: `SCRAPER_MAX_OUTPUT_SIZE_MB` (default 100MB)
- File must be written to `/output/` directory inside container

### Job failures
- Check scraper-runs collection in Payload dashboard for stdout/stderr
- Feature flag `enableScrapers` must be enabled in Settings
- User trust level must be 3+ to create scraper repos
