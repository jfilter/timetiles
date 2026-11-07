# ADR 0043: Per-Sheet Ingest Jobs With a Durable Run Record

## Status

Accepted (2026-11-07). Plan only; nothing below is implemented yet.

## Context

An ingest starts from one of three source workflows: `manual-ingest` (upload), `scheduled-ingest` (URL feed) and `scraper-ingest`. Each detects the sheets of its file, creates one IngestJob per sheet and then calls `processSheets` (`apps/web/lib/jobs/workflows/process-sheets.ts`). That function runs the six-task pipeline for every sheet inside the source workflow:

analyze-duplicates → detect-schema → validate-schema → create-schema-version → geocode-batch → create-events

`processSheets` wraps every sheet in its own `try/catch` inside `Promise.allSettled` and marks a failing sheet `FAILED` itself. The error never reaches Payload's job runner, so:

1. **Task retries never apply to a first import.** A dropped database connection, a geocoder timeout or a worker restart in the middle of a sheet fails the import permanently, although every task declares a retry budget. Only the post-review workflow `ingest-process` lets errors escape and gets retries.
2. **Payload's own model does not fit a fan-out inside one workflow.** Completed tasks are restored by task slug and task ID. One exhausted task ends the whole workflow job, including its sibling sheets. A failure outside any task permanently fails the job when the workflow declares no retries (`handleWorkflowError`). Payload documents small, independently retryable tasks; it documents neither parallel tasks inside one workflow nor child-job fan-out.

Several further defects come from the same structure:

3. **Quota reservation leak.** create-events reserves `TOTAL_EVENTS` for the new events of a sheet and reconciles the reservation against the actual inserts afterwards. The reserved amount lives only in handler locals. A crash or an ambiguous commit between reservation and reconciliation leaks the reservation, or adjusts it twice on retry.
4. **Orphaned jobs.** A Payload job whose worker dies keeps `processing = true` forever; nothing reclaims it. The stuck-ingest reapers inspect source IDs and treat `processing = true` as alive. Production holds at least one such job from a worker restart.
5. **Scheduled bookkeeping at the wrong moment.** `scheduled-ingest` evaluates the outcome when its own job finishes (`buildScheduledIngestFailure`) and treats unfinished work as failure. While a sheet waits for review, the schedule keeps firing and fetches new versions of the feed on top of the open review.
6. **Idempotency gaps that become visible once retries apply:**
   - Strict-mode validation marks the IngestJob `FAILED` and then throws (`validate-schema/validation-persistence.ts`). With retries, a permanent rejection would be retried.
   - Failed insert sub-batches in create-events become row errors (`create-events-batch/process-batch.ts`), so a transient database error never triggers a retry.
   - geocode-batch keeps results in memory until the whole pass ends. A retry repeats every lookup, including paid ones, and may return different coordinates.
   - A failed snapshot restore in create-events (`job-completion.ts`) logs and continues, so later writes can build on a half-restored dataset.
   - create-schema-version compares, creates and links in separate operations. A schema version that appears between attempts produces a second version.
   - `startStage` keeps the counters of the previous attempt, so progress jumps on retry.

## Decision

### Shape

- The source workflows **only dispatch**. They fetch or scrape, detect sheets, create the IngestJobs and the run record, and queue one child job per sheet. They no longer run pipeline tasks.
- Every sheet runs as its own `ingest-process` job, starting at `resumeFrom: "analyze-duplicates"`. First runs and review resumptions use the same workflow, and each sheet gets its own retry budget.
- Task errors escape to Payload. Retries follow the task budgets, and `onFail` on the final attempt marks the IngestJob `FAILED` (the mechanism `ingest-process` already uses).

### Durable run record

A new collection `ingest-runs` holds one row per source run:

| Field            | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `source`         | `manual`, `scheduled` or `scraper`, plus the relation to its source row |
| `ingestFile`     | The file that was split into sheets                                     |
| `expectedSheets` | Number of IngestJobs the dispatch must create                           |
| `dispatchedAt`   | Set once every child is queued; a run without it is incomplete          |
| `outcome`        | `pending`, `awaiting_review`, `completed`, `failed`                     |
| `accountedAt`    | Set once the source bookkeeping has run, so it runs exactly once        |

IngestJobs gain a `run` relation and an integer `generation`. Each child job carries the generation in its input.

- **Dispatch is transactional.** The source workflow bumps an IngestJob's generation and queues its child with the same transaction-bound `req`, so both happen or neither does. A unique index on `(ingestJob, generation)` in a small dispatch table blocks duplicates, because `payload.jobs.queue` has no deduplication of its own.
- **Redelivery is a no-op.** A source job that runs again finds `dispatchedAt` set and stops. A child whose generation is older than the IngestJob's current one, or whose IngestJob is already completed or awaiting review, returns before its first task.
- **Approvals start a new generation.** Approving a review bumps the generation and queues the resumption in one transaction, as the approval hook does today. Approving a high-row-error job still completes it without rerunning create-events.

### Reconciliation

`reconcileRun(runId)` derives the file status and the run outcome from the IngestJobs of a run. It runs after every child transition (in the `finally` of `ingest-process` and in `onFail`) and periodically from the maintenance queue. It takes a row lock on the run and is idempotent.

Once every expected sheet is completed, failed or awaiting review, it sets `outcome`: `failed` when any sheet failed, even if others completed, otherwise `awaiting_review` when any sheet awaits review, otherwise `completed`. It then runs the source bookkeeping exactly once and sets `accountedAt`:

- **Scheduled:** `lastStatus` stays `running` until the run settles. Success resets `currentRetries`, a review pause leaves it unchanged, and a failed run increments it once, regardless of how many sheets failed. A sheet that fails on every run therefore disables the whole feed and notifies its owner. Auto-disable keeps its threshold (`currentRetries > maxRetries`). Empty and unchanged-source runs keep succeeding immediately. A review that resolves later updates that run's history entry without counting it again and without overwriting a newer run's status.
- **Scheduled feed halt:** while any sheet of a schedule's run awaits review, `schedule-manager` does not trigger that schedule. The UI shows the schedule as waiting for review. Resolving or discarding the review releases it.
- **Scraper:** scrape success and import success are separate. `scraper-runs` links its run through `resultFile` and shows the import outcome. Scrape statistics are never incremented per child.
- **Manual:** the file status follows the run outcome; the existing IngestJob-driven progress UI stays.

`reconcile-failed-ingests` currently inspects only the parent `scheduled-ingest` job. It then reads run outcomes instead, so failures of a child, of a final callback or of a pre-dispatch step all end up in the bookkeeping.

### Quota reservation ledger

A `quota-reservations` table records each `TOTAL_EVENTS` reservation keyed by `(ingestJob, generation)`. The reservation and the usage increment happen in one transaction. Settlement, which converts the reservation to actual inserts, deletes the row in the same transaction as the usage adjustment. A retry of the same generation finds its own row and settles it instead of reserving again. Reconciliation releases the rows of obsolete generations and of failed jobs. `IMPORT_JOBS_PER_DAY` stays charged on IngestJob creation, which happens once per sheet.

### Orphaned jobs

- **Leases.** Every long task stage writes `heartbeatAt` on its IngestJob at least once per batch, geocode-batch included. A Payload job counts as abandoned when it is `processing`, its IngestJob's `heartbeatAt` is older than the lease (default 15 minutes, configurable in the app config), and its generation is still current. The geocoding batch size keeps the rate-limit wait of one batch well below the lease.
- **Recovery.** For an abandoned job, recovery first runs the snapshot rollback and the quota release of that generation. It then either bumps the generation and requeues the sheet (attempts left) or marks it `FAILED` (budget used up). It never touches a job with a fresh heartbeat, a job waiting for its retry backoff, or a sheet awaiting review.
- **Report only.** A scheduled recovery job finds abandoned jobs and writes what recovery would do to a persistent run history; it changes nothing. Applying is the documented manual command `timetiles ingest recover`, which prints the same report with counters and changes state only with `--apply`. The existing production job is resolved through this command after the release, not by hand.
- **Graceful shutdown.** Workers stop claiming new jobs on `SIGTERM` and wait for running tasks up to the container stop timeout. This shrinks the window but does not replace recovery.

### Idempotency fixes

| Gap                                  | Fix                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Strict validation marks then throws  | Return a terminal business outcome (`failed` with reason) instead of throwing                         |
| Insert sub-batch errors → row errors | Classify: connection, serialization and timeout errors throw for a retry; data errors stay row errors |
| Geocoding replay                     | Persist each successful lookup per run, keyed by address, bias and provider config; a retry reuses it |
| Snapshot restore continues on error  | A failed restore throws and blocks writes to the dataset until the restore succeeds                   |
| Schema version race                  | Compare, create and link under the dataset advisory lock from ADR 0041                                |
| Progress counters carry over         | `startStage` resets attempt-local counters per generation; the UI shows "retrying (attempt n of m)"   |
| Duplicate diagnostics on rerun       | analyze-duplicates replaces its configuration-error entries instead of appending                      |

### Concurrency

The child keeps its key `ingest:process:<ingestJobId>`. The source keys (`ingest:manual:<file>`, `ingest:scheduled:<schedule>`, `ingest:scraper:<scraper>`) then guard dispatch only. A second run of the same schedule is refused while `lastStatus` is `running` (unchanged), so it cannot dispatch over an unsettled run. Payload's concurrency keys are not an atomic lock across workers. Correctness keeps relying on the dataset advisory lock (ADR 0041) and on the generation check.

### Migration and rollout

- Schema changes (`ingest-runs`, dispatch table, `quota-reservations`, `generation`, `run` and `heartbeatAt` on IngestJobs) are generated with `make migrate-create`.
- Existing IngestJobs get generation 0 and no run. Post-review jobs already queued at deploy time carry no generation and are accepted as generation 0.
- Deploy with an empty ingest queue: the release notes tell operators to wait until no ingest is running. A source job that was mid-`processSheets` under the old code is not resumable. The recovery job reports it, and it is resolved by requeueing.

## Implementation order

Each step ends with `make check-ai`, `make test-ai` and a review round, and is merged on its own.

1. Idempotency fixes in the task handlers, still under `processSheets`. They are correct on their own and are the precondition for retries.
2. `ingest-runs`, generations and transactional dispatch; children run as `ingest-process`; `processSheets` is deleted.
3. `reconcileRun` with manual, scheduled and scraper bookkeeping, the scheduled feed halt and the reconcile-failed-ingests switch.
4. Quota reservation ledger.
5. Heartbeats, the report-only recovery job, `timetiles ingest recover`, and graceful shutdown.
6. Docs: pipeline architecture pages, the scheduled-import guide (review halt), the operator notes on the recovery job, and an update to ADR 0041's alternatives section.

## Tests

Integration tests against real PostgreSQL and Payload, no mocks:

- A transient failure in each task retries and then succeeds; the final failure runs `onFail` and marks only that sheet.
- Two sheets with different exhausted budgets end with independent outcomes.
- Redelivered source jobs and redelivered children: no duplicate dispatch, no duplicate events, obsolete generations stop before their first task.
- Two workers racing on the same run (dispatch and reconciliation).
- Crash injection after an event batch, after a snapshot write, after quota reservation, after settlement, and after a task completed but before its log entry.
- Schema version creation racing a concurrent import into the same dataset.
- Geocoding retry reuses persisted results; a different bias does not.
- Scheduled accounting counts exactly once for mixed failure and review outcomes and for a late approval; the schedule does not fire while a review is open.
- Scraper: scrape success with import failure shows both.
- Every approval resume point starts a new generation and completes.
- Progress counters reset on retry.
- Recovery: live, backing off, paused, crashed and obsolete executions; the scheduled job and the command without `--apply` change nothing.
- A geocoding batch against a rate-limited provider writes its heartbeat within the lease.

## Consequences

- Every first import gets the retry behaviour that only resumptions had, and one bad sheet no longer takes its siblings down.
- The pipeline gains three tables and a reconciliation step; the source workflows shrink to dispatch.
- Scheduled feeds stop fetching while a review is open, which delays data for feeds whose reviews sit unattended.
- A sheet that keeps failing disables its whole feed, including the sheets that import fine.
- Abandoned jobs stay stuck until an operator runs `timetiles ingest recover --apply`.
- Payload upgrades must recheck task restoration, `onFail` ordering and workflow error handling, on which this design depends.
