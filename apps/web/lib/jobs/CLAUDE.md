# Background Jobs

Payload CMS job handlers and workflows for async processing (ingest, geocoding, etc.).

## Key Gotchas

1. **Jobs auto-delete on completion** — Query pending jobs BEFORE running, verify side effects after
2. **Don't queue workflows manually** — Hooks in `lib/collections/` queue workflows (e.g., `ingest-files` afterChange queues `manual-ingest`, `ingest-jobs` afterChange queues `ingest-process` on approval)
3. **Job input is typed** — See `payload.config.ts` for job definitions and input types
4. **Error model** — Tasks throw for failures (Payload retries), return `{ needsReview: true }` for human review, return data for success
5. **`onFail` does not fire with `Promise.allSettled`** — Multi-sheet workflows use per-sheet try/catch + `markSheetFailed` instead

## Task Handler Pattern

```typescript
export const myJobHandler: TaskHandler<"my-job"> = async ({ input, req }) => {
  const { payload } = req;
  // Do work, use payload for DB access
  // Throw on transient failure (Payload retries)
  // Return needsReview: true for human review
  return { output: { success: true } };
};
```

## Workflow Architecture

4 workflows orchestrate the ingest pipeline (defined in `workflows/`):

| Workflow           | Queued by                       | Purpose                                                       |
| ------------------ | ------------------------------- | ------------------------------------------------------------- |
| `manual-ingest`    | `ingest-files` afterChange hook | Full pipeline for user uploads                                |
| `scheduled-ingest` | `schedule-manager` job          | URL fetch + full pipeline                                     |
| `scraper-ingest`   | `schedule-manager` job          | Scraper execution + full pipeline                             |
| `ingest-process`   | `ingest-jobs` afterChange hook  | Post-review resume (schema version → geocode → create events) |

All ingest workflows run on the `ingest` queue with per-resource concurrency keys.

## Progress Tracking

Use `ProgressTrackingService.updateAndCompleteBatch()` for all batch progress writes in jobs that iterate file rows (schema detection, event creation). This combines progress update and batch completion into a single DB write, avoiding two separate read-serialize-write cycles per batch.

Throttle writes to reduce DB load (e.g., write every N batches via a `PROGRESS_WRITE_INTERVAL` constant). See `create-events-batch-job.ts` for the reference pattern.

Exception: `geocode-batch-job.ts` uses `updateStageProgress()` alone because geocoding tracks unique locations (not file-row batches) and has no batch number concept.

## See Also

- **tests/integration/CLAUDE.md** — Job testing patterns
- **lib/jobs/workflows/** — Workflow definitions and shared sheet-processing logic
