# Integration Testing Patterns

Patterns for integration testing with Payload CMS, PostgreSQL, and background jobs.

## Critical: Job Auto-Deletion

**Payload CMS automatically deletes completed jobs** (`deleteJobOnComplete: true` is default).

### Implications

- Cannot query job records after execution - they're deleted
- Must check pending jobs BEFORE running them
- Verify side effects (what the job created/changed), not job records
- Check job counts at each stage to detect double-queueing

### Pattern: Verify Jobs Before Execution

```typescript
// ✅ Check job was queued BEFORE running
const pendingJobs = await payload.find({
  collection: "payload-jobs",
  where: { taskSlug: { equals: "analyze-duplicates" }, completedAt: { exists: false } },
});
expect(pendingJobs.docs.length).toBe(1);

// Now run it
await payload.jobs.run({ allQueues: true });

// Check side effects, NOT job records
const events = await payload.find({ collection: "events" });
expect(events.docs.length).toBe(3);
```

## Workflow-Based Job Queueing

Ingest jobs are orchestrated by 4 Payload workflows (`manual-ingest`, `scheduled-ingest`, `scraper-ingest`, `ingest-process`). Workflows are queued via collection `afterChange` hooks — NOT manually in job handlers or tests.

### Pattern: Let Hooks Queue Workflows

```typescript
// ✅ CORRECT - Create the record; afterChange hook queues the workflow
const ingestFile = await payload.create({
  collection: "ingest-files",
  data: {
    /* ... */
  },
});
// Hook automatically queues manual-ingest workflow

// ✅ CORRECT - Approve a NEEDS_REVIEW job; afterChange hook queues ingest-process
await payload.update({
  collection: "ingest-jobs",
  id: ingestJobId,
  data: { stage: "APPROVED", schemaValidation: { approvedAt: new Date().toISOString() } },
});

// ❌ WRONG - Don't queue workflows manually in tests
await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId } });
```

### Pattern: Drain Jobs in Tests

Tests run jobs in-process with `payload.jobs.run()`. Use a drain loop to process all chained workflow tasks:

```typescript
// Run all pending jobs across all queues until none remain
let hasMore = true;
while (hasMore) {
  const result = await payload.jobs.run({ limit: 100 });
  const ran = result?.jobStatus ? Object.keys(result.jobStatus).length : 0;
  hasMore = ran > 0;
}

// Then verify side effects
const events = await payload.find({ collection: "events" });
expect(events.docs.length).toBe(3);
```

## Non-Isolation Model (`isolate: false`)

Integration tests run with `isolate: false` — multiple test files share a fork process (same PID, same module cache, same Payload singleton). Each fork gets one database (keyed by `process.pid`).

**Implications:**

- **`describe.sequential()` is required** on every test suite
- **Pass specific collections to `truncate()`** — only reset what your tests touch
- **Global `afterEach`** automatically runs `vi.restoreAllMocks()` and `DELETE FROM payload_jobs` (in `global-setup.ts`)
- **Never close the Payload connection** — the singleton is reused by all files in the fork

```typescript
describe.sequential("Feature Name", () => {
  const collectionsToReset = ["events", "import-files", "import-jobs", "payload-jobs"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });
});
```

**Tip:** Use `IMPORT_PIPELINE_COLLECTIONS_TO_RESET` for import pipeline tests instead of listing collections manually.

### Prefer Unique IDs Over Truncation

Where possible, avoid `truncate()` by scoping queries to specific IDs. The `with*` helpers already generate unique names/slugs, so tests are naturally isolated when you query by the IDs they return:

```typescript
// ✅ No truncation needed — query scoped to this test's catalog
const { catalog } = await withCatalog(testEnv);
const { dataset } = await withDataset(testEnv, catalog.id);
const result = await testEnv.payload.find({ collection: "datasets", where: { catalog: { equals: catalog.id } } });
expect(result.docs).toHaveLength(1);
```

Reserve `truncate()` for tests that truly need a clean slate (count assertions across entire collections, import pipeline global job state).

## Common Pitfalls

| Pitfall                                  | Solution                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| Query jobs after completion              | Check BEFORE running or verify side effects          |
| Missing `completedAt: { exists: false }` | Always filter for pending jobs only                  |
| Manual workflow queueing                 | Let hooks queue workflows; use drain loop in tests   |
| Not filtering by ingestJobId             | Always filter: `"input.ingestJobId": { equals: id }` |
| Shared singleton interference            | Use `describe.sequential()` for mutable singletons   |
| Missing `describe.sequential()`          | Required — `isolate: false` means shared fork state  |
| Calling `truncate()` without collections | Pass specific collections, not empty call            |
| Closing Payload connection in cleanup    | Never close — singleton reused by all files in fork  |

## See Also

- `lib/collections/ingest-files.ts` - Hook queues `manual-ingest` workflow on file upload
- `lib/collections/ingest-jobs/hooks.ts` - Hook queues `ingest-process` workflow on NEEDS_REVIEW approval
- `lib/jobs/workflows/` - All 4 workflow definitions
- `tests/integration/services/job-queueing.test.ts` - Job queueing examples
