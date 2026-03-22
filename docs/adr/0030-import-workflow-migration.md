# ADR 0030: Import Pipeline Workflow Migration

## Status

Accepted

**Implementation notes:**

- Naming uses `ingest` (not `import`) following the codebase rename
- Sheets process in parallel via `Promise.all` within workflow handlers (supported since Payload 3.80, PRs #11917, #13452)
- Production workers run as separate Docker containers via `pnpm payload jobs:run --cron`
- Development uses `autoRun` within the Next.js process

## Context

The import pipeline (ADR 0004) currently uses a **hook-driven state machine** to orchestrate 7 sequential tasks. Three components work together: job handlers update the `stage` field, `afterChange` hooks call `StageTransitionService`, and `StageTransitionService` validates transitions against a static graph and queues the next job.

This design has served well but has grown problematic:

1. **Three use cases, one pipeline.** Manual uploads, scheduled imports, and scraper imports all share the same state machine, differentiated by conditional flags (`autoApproveSchema`, `schemaMode`, `skipDuplicateChecking`). The flow is implicit — reading the code doesn't make it obvious which paths apply to which use case.

2. **Hook-driven orchestration is indirect.** Adding or modifying a stage requires changes in three places: the stage constants, the transition graph, and the hook logic. The pipeline "flow" exists across multiple files and is reconstructed by tracing hooks rather than reading a linear handler.

3. **AWAIT_APPROVAL blocks the pipeline.** For manual imports, the pipeline pauses mid-execution while waiting for a human to approve schema changes. For automated imports, `autoApproveSchema` bypasses this, but the conditional logic adds complexity.

4. **No built-in retry from failure point.** The pipeline uses a custom `ErrorRecoveryService` with error classification and exponential backoff. While more sophisticated than simple retry, it duplicates what Payload's workflow system provides natively.

Payload CMS 3.80 introduced **Workflows** — a first-class way to compose multiple tasks into a sequential pipeline with automatic retry from the failure point. Completed tasks return cached output on re-run, eliminating duplicate work.

## Decision

Replace the hook-driven state machine with **4 Payload Workflows**, one per import use case plus a post-review workflow for schema drift resolution.

### Architecture Overview

```
Manual upload:
  wizard → ImportFile → manual-import workflow:
    dataset-detection → for each sheet:
      analyze → detect-schema → validate → create-schema → geocode → create-events
      (skip sheet on task failure, continue to next)

Scheduled import:
  schedule-manager → scheduled-import workflow:
    url-fetch → dataset-detection → for each sheet:
      same 6-task pipeline

Scraper import:
  trigger → scraper-import workflow:
    scraper-execution → dataset-detection → for each sheet:
      same 6-task pipeline

Schema drift (automated imports):
  validate-schema returns { success: false, reason: 'needs-review' }
  → ImportJob set to NEEDS_REVIEW, sheet skipped in loop
  → user reviews & approves
  → import-process workflow: create-schema → geocode → create-events
```

### Workflow 1: `manual-import`

**Scope:** Per ImportFile. Processes all sheets in a single workflow instance.

**Input:** `{ importFileId: number }`

**Handler:**

```typescript
handler: async ({ job, tasks }) => {
  const detection = await tasks["dataset-detection"]("detect-sheets", {
    input: { importFileId: job.input.importFileId },
  });
  if (!detection.output.success) return;

  for (const sheet of detection.output.sheets) {
    const id = sheet.importJobId;
    const s = sheet.index;

    const analyze = await tasks["analyze-duplicates"](`analyze-${s}`, { input: { importJobId: id } });
    if (!analyze.output.success) continue;

    const schema = await tasks["detect-schema"](`detect-schema-${s}`, { input: { importJobId: id } });
    if (!schema.output.success) continue;

    const validate = await tasks["validate-schema"](`validate-${s}`, { input: { importJobId: id } });
    if (!validate.output.success) continue;

    const version = await tasks["create-schema-version"](`create-version-${s}`, { input: { importJobId: id } });
    if (!version.output.success) continue;

    const geocode = await tasks["geocode-batch"](`geocode-${s}`, { input: { importJobId: id, batchNumber: 0 } });
    if (!geocode.output.success) continue;

    await tasks["create-events-batch"](`create-events-${s}`, { input: { importJobId: id } });
  }
};
```

**Multi-sheet behavior:**

- `dataset-detection` creates one ImportJob per sheet and returns the list
- The loop processes each sheet sequentially with unique task IDs (`analyze-0`, `analyze-1`, etc.)
- If a sheet fails or needs review, it is skipped via `continue` — remaining sheets still process
- On workflow retry (transient failure), completed tasks return cached output from Payload's built-in caching

**Concurrency:** `({ input }) => \`file:${input.importFileId}\``

### Workflow 2: `scheduled-import`

**Scope:** Per ScheduledImport trigger (schedule-manager or webhook).

**Input:** `{ scheduledImportId, sourceUrl, authConfig, catalogId, ... }`

**Handler:**

```typescript
handler: async ({ job, tasks }) => {
  const fetch = await tasks['url-fetch']('fetch-url', {
    input: { scheduledImportId: job.input.scheduledImportId, ... }
  })
  if (!fetch.output.success) return

  const detection = await tasks['dataset-detection']('detect-sheets', {
    input: { importFileId: fetch.output.importFileId }
  })
  if (!detection.output.success) return

  // Same sheet-processing loop as manual-import
  for (const sheet of detection.output.sheets) {
    // ... (shared helper function)
  }
}
```

**Concurrency:** `({ input }) => \`sched:${input.scheduledImportId}\``

### Workflow 3: `scraper-import`

**Scope:** Per Scraper trigger.

**Input:** `{ scraperId, ... }`

Same structure as `scheduled-import` but with `scraper-execution` as the first task instead of `url-fetch`.

**Concurrency:** `({ input }) => \`scraper:${input.scraperId}\``

### Workflow 4: `import-process`

**Scope:** Per ImportJob, after NEEDS_REVIEW resolution.

**Input:** `{ importJobId: number }`

**Handler:**

```typescript
handler: async ({ job, tasks }) => {
  const id = job.input.importJobId;

  const version = await tasks["create-schema-version"]("create-version", { input: { importJobId: id } });
  if (!version.output.success) return;

  const geocode = await tasks["geocode-batch"]("geocode", { input: { importJobId: id, batchNumber: 0 } });
  if (!geocode.output.success) return;

  await tasks["create-events-batch"]("create-events", { input: { importJobId: id } });
};
```

**When used:** After `validate-schema` detects schema drift in an automated import and the user resolves it:

1. `validate-schema` returns `{ success: false, reason: 'needs-review' }` → sheet skipped in the main workflow's loop
2. ImportJob set to `NEEDS_REVIEW` with schema comparison details
3. User reviews in UI, sees breaking changes / new fields / suggested renames
4. User approves → `import-jobs` hook detects approval → queues `import-process` workflow
5. `import-process` runs the remaining 3 tasks for that specific ImportJob

**Concurrency:** `({ input }) => \`import:${input.importJobId}\``

### Task Output Contract

Every task handler returns structured output. The workflow handler checks `success` and decides whether to continue or skip.

**Rules:**

- **Returns `{ success: true, ... }`** → workflow continues to next task
- **Returns `{ success: false, reason: '...' }`** → workflow handler decides (skip sheet, stop workflow)
- **Throws an error** → Payload retries the task automatically (for transient errors: DB timeouts, OOM, network failures)
- Tasks should only throw for unexpected/transient errors. Business logic outcomes (schema drift, quota exceeded, empty file) use return values.

| Task                    | Success Output                                                               | Failure Output                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `dataset-detection`     | `{ success, sheets: [{ index, importJobId, name, rowCount }] }`              | `{ success: false, reason: 'unreadable' \| 'empty' }`                                       |
| `analyze-duplicates`    | `{ success, totalRows, uniqueRows, internalDuplicates, externalDuplicates }` | `{ success: false, reason }`                                                                |
| `detect-schema`         | `{ success, fieldCount, detectedTypes }`                                     | `{ success: false, reason }`                                                                |
| `validate-schema`       | `{ success, hasChanges, isBreaking }`                                        | `{ success: false, reason: 'needs-review' \| 'quota-exceeded' \| 'strict-mode-violation' }` |
| `create-schema-version` | `{ success, versionNumber }`                                                 | `{ success: false, reason }`                                                                |
| `geocode-batch`         | `{ success, geocoded, failed, skipped }`                                     | `{ success: false, reason }`                                                                |
| `create-events-batch`   | `{ success, eventCount, duplicatesSkipped }`                                 | `{ success: false, reason }`                                                                |

### AWAIT_APPROVAL → NEEDS_REVIEW

The `AWAIT_APPROVAL` stage is replaced with `NEEDS_REVIEW`:

| Aspect            | Before (AWAIT_APPROVAL)                 | After (NEEDS_REVIEW)                                             |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------- |
| When              | Mid-pipeline, blocks all processing     | End of analysis phase, only blocks event creation for that sheet |
| Scope             | Stops the entire pipeline               | Skips the affected sheet; other sheets continue                  |
| Purpose           | User approves detected schema           | User resolves schema drift (approve, remap, discard)             |
| Resume            | Hook advances stage, pipeline continues | Hook queues `import-process` workflow                            |
| Manual uploads    | Always triggers (wizard approval)       | Never triggers (wizard handles config upfront)                   |
| Automated imports | Bypassed via `autoApproveSchema`        | Triggers when schemaMode detects drift                           |

### Shared Sheet-Processing Loop

The per-sheet processing logic is identical across `manual-import`, `scheduled-import`, and `scraper-import`. It is extracted to a shared helper:

```typescript
// lib/jobs/workflows/shared/process-sheets.ts
export async function processSheets(sheets: SheetInfo[], tasks: RunTaskFunctions): Promise<void> {
  for (const sheet of sheets) {
    const id = sheet.importJobId;
    const s = sheet.index;

    const analyze = await tasks["analyze-duplicates"](`analyze-${s}`, { input: { importJobId: id } });
    if (!analyze.output.success) continue;

    const schema = await tasks["detect-schema"](`detect-schema-${s}`, { input: { importJobId: id } });
    if (!schema.output.success) continue;

    const validate = await tasks["validate-schema"](`validate-${s}`, { input: { importJobId: id } });
    if (!validate.output.success) continue;

    const version = await tasks["create-schema-version"](`create-version-${s}`, { input: { importJobId: id } });
    if (!version.output.success) continue;

    const geocode = await tasks["geocode-batch"](`geocode-${s}`, { input: { importJobId: id, batchNumber: 0 } });
    if (!geocode.output.success) continue;

    await tasks["create-events-batch"](`create-events-${s}`, { input: { importJobId: id } });
  }
}
```

### Error Handling and Recovery

**Transient errors (task throws):**

Payload's workflow system handles this natively. When a task throws:

1. The task is retried (up to its configured retry count)
2. If retries are exhausted, the workflow is marked failed
3. On manual retry (re-queuing), all previously completed tasks return cached results
4. Processing resumes from the failed task

**Business logic failures (task returns `{ success: false }`):**

The workflow handler uses `continue` to skip the affected sheet. The ImportJob is updated with error details by the task handler itself. This is NOT retried because it's not an error — it's a decision.

**Schema drift:**

A specific business failure. `validate-schema` returns `{ success: false, reason: 'needs-review' }` and sets the ImportJob stage to `NEEDS_REVIEW`. The sheet is skipped. The user resolves in the UI, which triggers `import-process`.

**Comparison with current `ErrorRecoveryService`:**

| Capability               | Current                                                         | After Migration                                    |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| Retry from failure point | Custom: `getNextRecoveryStage()` + `processPendingRetries` cron | Built-in: Payload workflow caching                 |
| Error classification     | Custom: `ErrorRecoveryService.classifyError()`                  | Task-level: throw (transient) vs return (business) |
| Exponential backoff      | Custom: 30s base, 2x multiplier, 5min max                       | Payload task-level retry config                    |
| Manual recovery          | `resetJobToStage()`                                             | Re-queue workflow or queue `import-process`        |
| Per-stage restart        | Yes (any recovery stage)                                        | Yes (cached tasks skip, failed task re-runs)       |

The `ErrorRecoveryService` and `processPendingRetries` cron job can be simplified. `failImportJob()` utility is retained for marking ImportJob records as FAILED with error context.

### What Is Removed

| Component                   | File                                                                                           | Reason                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `StageTransitionService`    | `lib/import/stage-transition.ts`                                                               | Replaced by workflow sequencing                                     |
| Stage transition validation | `lib/constants/stage-graph.ts` (`VALID_TRANSITIONS`, `isValidTransition`, `STAGE_TO_JOB_TYPE`) | No longer needed; workflow handler defines the flow                 |
| Hook-driven orchestration   | `lib/collections/import-jobs/hooks.ts` (afterChange → StageTransitionService calls)            | Workflows handle task sequencing                                    |
| `handleSchemaApproval`      | `lib/collections/import-jobs/hooks.ts`                                                         | AWAIT_APPROVAL removed; NEEDS_REVIEW uses different resolution path |

### What Is Preserved

| Component                  | File                                   | Reason                                                                        |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| All 7 task handlers        | `lib/jobs/handlers/`                   | Core logic unchanged; only remove stage transitions and add structured output |
| `ImportJob` as state store | `lib/collections/import-jobs/`         | Tasks still write schema, duplicates, progress, results to ImportJob          |
| `ProgressTrackingService`  | `lib/import/progress-tracking.ts`      | Per-stage progress tracking unchanged                                         |
| `STAGE_ORDER`              | `lib/constants/stage-graph.ts`         | Used by UI to display progress                                                |
| `failImportJob()`          | `lib/jobs/utils/resource-loading.ts`   | Marks ImportJob as FAILED with error context                                  |
| 13 standalone system jobs  | Various                                | Not part of import pipeline; unchanged                                        |
| Admin audit logging        | `lib/collections/import-jobs/hooks.ts` | Retained in simplified hooks                                                  |
| Quota tracking             | `lib/collections/import-jobs/hooks.ts` | Retained in simplified hooks                                                  |

### Registration

```typescript
// lib/config/payload-shared-config.ts
jobs: {
  tasks: ALL_JOBS,
  workflows: [
    manualImportWorkflow,
    scheduledImportWorkflow,
    scraperImportWorkflow,
    importProcessWorkflow,
  ],
  enableConcurrencyControl: true,
}
```

## Implementation Plan

### Step 1: Define task output types

Create `lib/jobs/types/task-outputs.ts` with typed interfaces for each task's success and failure output.

### Step 2: Create 4 workflow definitions

New files:

- `lib/jobs/workflows/manual-import.ts`
- `lib/jobs/workflows/scheduled-import.ts`
- `lib/jobs/workflows/scraper-import.ts`
- `lib/jobs/workflows/import-process.ts`
- `lib/jobs/workflows/shared/process-sheets.ts`

### Step 3: Refactor task handlers

Each of the 7 pipeline task handlers:

- Return `{ output: { success: true, ...data } }` or `{ output: { success: false, reason } }`
- Remove `stage: PROCESSING_STAGE.NEXT_STAGE` from final `payload.update()`
- Add `stage` tracking at handler start (for UI progress display)
- Keep ImportJob field updates, ProgressTrackingService, error logging

Key per-handler changes:

- `dataset-detection-job.ts` — return `{ sheets: [...] }` instead of queuing workflows directly
- `validate-schema-job.ts` — return `{ success: false, reason: 'needs-review' }` instead of routing to AWAIT_APPROVAL. Set ImportJob to NEEDS_REVIEW
- `create-events-batch-job.ts` — mark ImportJob COMPLETED on success

### Step 4: Replace AWAIT_APPROVAL with NEEDS_REVIEW

- `lib/constants/import-constants.ts` — replace `AWAIT_APPROVAL` with `NEEDS_REVIEW`
- `lib/constants/stage-graph.ts` — update (display-only)
- `lib/collections/import-jobs/hooks.ts` — remove `handleSchemaApproval`, add NEEDS_REVIEW → `import-process` trigger
- `lib/collections/import-jobs/fields.ts` — update stage options

### Step 5: Update entry points

- `schedule-manager-job.ts` → queue `scheduled-import` workflow
- `trigger-service.ts` → queue `scheduled-import` workflow
- Scraper triggers → queue `scraper-import` workflow
- Import-files hooks → queue `manual-import` workflow (with `importFileId`)

### Step 6: Remove hook-driven orchestration

- Remove `lib/import/stage-transition.ts`
- Simplify `lib/constants/stage-graph.ts` — keep `STAGE_ORDER` for display
- Simplify `lib/collections/import-jobs/hooks.ts` — remove StageTransitionService calls
- Simplify `lib/import/error-recovery.ts` — workflow handles retry

### Step 7: Add concurrency controls and register workflows

### Step 8: Update tests

- Remove `StageTransitionService` / `VALID_TRANSITIONS` tests
- Add workflow integration tests per use case
- Test multi-sheet partial failure (sheet 1 OK, sheet 2 drift, sheet 3 OK)
- Test workflow retry with cached tasks

## Consequences

- **Explicit flows.** Each import type has a readable, linear workflow handler. New import types can be added by defining a new workflow.
- **Schema drift is non-blocking.** In a multi-sheet file, one sheet's schema drift doesn't block the other sheets. The drifted sheet is resolved independently via `import-process`.
- **Retry is built-in.** Payload's workflow caching eliminates the need for custom recovery logic. Completed tasks are never re-executed on retry.
- **Slight overhead for single-sheet imports.** The workflow framework adds one wrapper job beyond the individual task jobs. For the current scale this is negligible.
- **Sequential sheet processing.** Sheets within one workflow are processed sequentially. Parallel processing would require separate workflow instances per sheet, which was considered but rejected for conceptual simplicity (one upload = one workflow).
- **Migration requires a database migration.** Renaming `AWAIT_APPROVAL` to `NEEDS_REVIEW` in the stage enum requires a Payload migration for existing ImportJob records.
- **`ErrorRecoveryService` is simplified but not removed.** `failImportJob()` and error classification remain useful for ImportJob-level error reporting. The `processPendingRetries` cron job may be removed if workflow-level retry is sufficient.
- **Supersedes ADR 0004** (partially). The stage-based state machine described in ADR 0004 is replaced by workflow sequencing. The stages themselves remain as a progress display mechanism. Geocoding, batch processing, and error classification details in ADR 0004 are unchanged.
