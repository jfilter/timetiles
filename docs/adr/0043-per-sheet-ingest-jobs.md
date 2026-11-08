# ADR 0043: Per-Sheet Ingest Jobs With a Durable Run Record

## Status

Accepted (2026-11-07). Implemented (2026-11-08).

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
| `accountedAt`    | Set on the first settlement, including a review pause                   |
| `countedAt`      | Set once a completed or failed outcome entered the source statistics    |

IngestJobs gain a `run` relation and an integer `generation`. Each child job carries the generation in its input.

- **Dispatch is transactional.** dataset-detection creates the run (unique per ingest file), locks it, bumps each IngestJob's generation, queues each child with the same transaction-bound `req` and sets `dispatchedAt`, all in one transaction. `payload.jobs.queue` has no deduplication of its own; the row lock on the run serializes concurrent dispatchers, and the second one finds `dispatchedAt` set.
- **Redelivery is a no-op.** A source job that runs again finds `dispatchedAt` set and stops. A child whose generation differs from the IngestJob's current one, or whose IngestJob is already completed, returns before its first task. An approved review keeps the `NEEDS_REVIEW` stage until the resumed tasks move it, so only the generation tells a stale child from a resumption.
- **Approvals start a new generation.** Approving a review bumps the generation and queues the resumption in one transaction, as the approval hook does today. Approving a high-row-error job still completes it without rerunning create-events.

### Reconciliation

`reconcileRun(runId)` derives the file status and the run outcome from the IngestJobs of a run. It runs after every child transition (in the `finally` of `ingest-process` and in `onFail`) and every minute from the maintenance task `reconcile-ingest-runs`. It takes a row lock on the run, and for a scheduled run on its schedule before any other write, and is idempotent.

Once every expected sheet is completed, failed or awaiting review, it sets `outcome` (an `awaiting_review` run keeps that outcome while an approved resumption runs): `failed` when any sheet failed, even if others completed, or when a sheet was deleted after dispatch (a discarded review), otherwise `awaiting_review` when any sheet awaits review, otherwise `completed`. It then runs the source bookkeeping, setting `accountedAt` on the first settlement and `countedAt` once a completed or failed outcome entered the statistics:

- **Scheduled:** `lastStatus` stays `running` until the run settles. Success resets `currentRetries`, a review pause leaves it unchanged, and a failed run increments it once, regardless of how many sheets failed. A sheet that fails on every run therefore disables the whole feed and notifies its owner. Auto-disable keeps its threshold (`currentRetries > maxRetries`). Empty and unchanged-source runs keep succeeding immediately. A review pause counts nothing. The run counts once, when it first completes or fails, replacing its paused history entry; it sets the schedule's last status only while that entry is the newest and no newer run is running. Later changes, such as a retried sheet, only amend the entry.
- **Scheduled feed halt:** while a run of the schedule has the outcome `awaiting_review` or one of its sheets awaits review (also next to a failed sheet), `schedule-manager` does not trigger that schedule, and the stuck-schedule reaper leaves a schedule with an unsettled run alone. The UI shows the schedule as waiting for review. Resolving or discarding the review releases it.
- **Scraper:** scrape success and import success are separate. `scraper-runs` links its run through `resultFile` and shows the import outcome. Scrape statistics are never incremented per child.
- **Manual:** the file status follows the run outcome; the existing IngestJob-driven progress UI stays.

`reconcile-failed-ingests` records only a final failure of the `scheduled-ingest` job before dispatch. Once a run of the schedule is dispatched, `reconcileRun` owns the bookkeeping, so failures of a child or of a final callback end up there and are counted once.

### Quota reservation ledger

A `quota-reservations` table holds, per `(ingestJob, generation)`, the number of new events currently charged to the owner's `TOTAL_EVENTS` usage. Every change of the usage happens in the same transaction as the change of that row:

- **Reserve** before the bulk insert sets the row to the expected new events and charges the difference. A retry of the same generation, also after a crash after settlement, finds its row and pays only the difference. It first releases the rows of older generations of the job, whose events the attempt-start cleanup has already removed. A reservation over the limit fails and records nothing.
- **Settle** after the insert sets the row to the events actually created. The events are committed, so a top-up beyond the limit is charged anyway.
- **Release** deletes the job's rows and refunds them. It runs only together with a successful rollback of the events: in the task's catch, in `onFail`, and in recovery. A failed rollback keeps the charge, because the events are still there.

- **Owner change.** A row holds the user it charged. When the file's owner changes between steps, the next step refunds that user and charges the new owner.
- **Deletion.** An IngestJob whose lease is live cannot be deleted, also not through account or dataset deletion, because its running task would keep writing events and overwriting existing ones. The deletion locks the job's unfinished children, so a worker cannot start one until it commits. Deleting it keeps every settled charge, because `TOTAL_EVENTS` is a lifetime count. An unsettled reservation, such as that of a crashed attempt, keeps the charge for the inserted events that still exist and refunds the rest.

A settled row stays in place, so a crash anywhere between reservation and the terminal stage cannot charge an attempt twice. `IMPORT_JOBS_PER_DAY` stays charged on IngestJob creation, which happens once per sheet.

Each task carries the generation it was started for. A task of a superseded generation skips create-events, and its `onFail` and `onSuccess` leave the job alone, so it cannot roll back, fail or complete newer work. A late write of a task (its error message, `FAILED`, `COMPLETED`) locks the IngestJob row and happens only while the generation still matches. Approval, retry and reset change the generation under the same row lock. Recovery bumps it under the same row lock, for create-events also under the dataset lease, and create-events checks the generation under that lease, both in the handler and in the `onFail` rollback.

`TOTAL_EVENTS` stays a lifetime count, as before: deleting an event does not refund it. One rare case undercounts: a later import on the same dataset updates in place the events that a crashed attempt inserted, and the crashed attempt's rollback then refunds them. The quota is soft, so this stays documented rather than handled.

### Orphaned jobs

- **Leases.** While a workflow or standalone task runs, its worker touches the Payload job's `updatedAt` every minute from a timer, independent of task progress. A per-batch heartbeat on the IngestJob would go silent while a task waits on a provider's `Retry-After`, which has no upper bound, and raise false alarms. A `processing` job whose `updatedAt` is older than the lease (default 15 minutes, `ingest.leaseMinutes` in the app config, at least five heartbeat intervals) belongs to a dead worker.
- **Kinds.** Recovery distinguishes three findings. _Abandoned_: a stale `ingest-process` job whose sheet is in a processing stage at the job's generation. _Orphaned_: a sheet in a processing stage, untouched for longer than the lease, that no unfinished `ingest-process` job serves, such as a sheet left by a source job that died mid-`processSheets` under the old code. _Obsolete_: any other stale job of the ingest queue, such as one of a superseded generation, or a scheduled task of any queue; it is only closed. A stale job stays `processing` and its concurrency key blocks new children of the sheet, so recovery closes it with an error before it requeues.
- **Recovery.** For a sheet that died in create-events, recovery first takes the dataset lease and runs the snapshot rollback and the quota release of that generation; a busy lease skips the sheet until the next run. It then either bumps the generation and requeues the sheet from its stage, counting the attempt in `recoveryAttempts`, or marks it `FAILED` once the attempts reach the stage task's retries. Approval, retry and reset start a fresh count; within one resumption the count is shared across stages. Before a rollback, recovery rechecks the finding under the dataset lease, so a sheet that moved on keeps its events. It never touches a job with a fresh heartbeat, a job waiting for its retry backoff, or a sheet awaiting review.
- **Report only.** An hourly recovery job finds these cases and writes what recovery would do to a persistent run history (`ingest-recovery-runs`, a row only when it finds something); it changes nothing. Applying is the documented manual command `timetiles ingest recover`, which prints the same report with counters and changes state only with `--apply`. The existing production job is resolved through this command after the release, not by hand.
- **Graceful shutdown.** Workers stop claiming new jobs on `SIGTERM` and wait for running tasks up to the container stop timeout (five minutes for the ingest worker). This shrinks the window but does not replace recovery.

### Idempotency fixes

| Gap                                  | Fix                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict validation marks then throws  | Return a terminal business outcome (`failed` with reason) instead of throwing                                                                                                                |
| Insert sub-batch errors → row errors | Classify: connection, serialization and timeout errors throw for a retry; data errors stay row errors                                                                                        |
| Geocoding replay                     | Checkpoint successful lookups after every chunk, keyed by address, bias and provider revision; a retry reuses them. A crash replays at most the unchecked chunk and retries failed addresses |
| Snapshot restore continues on error  | A failed restore throws before the attempt writes; the retry restores first                                                                                                                  |
| Schema version race                  | Compare, create and link in one transaction under the per-dataset schema version lock                                                                                                        |
| Progress counters carry over         | `startStage` resets attempt-local counters per generation; the UI shows "retrying (attempt n of m)"                                                                                          |
| Duplicate diagnostics on rerun       | analyze-duplicates replaces its configuration-error entries instead of appending                                                                                                             |

### Concurrency

The child keeps its key `ingest:process:<ingestJobId>`. The source keys (`ingest:manual:<file>`, `ingest:scheduled:<schedule>`, `ingest:scraper:<scraper>`) then guard dispatch only. A second run of the same schedule is refused while `lastStatus` is `running` (unchanged), so it cannot dispatch over an unsettled run. Payload's concurrency keys are not an atomic lock across workers. Correctness keeps relying on the dataset advisory lock (ADR 0041) and on the generation check.

### Migration and rollout

- Schema changes (`ingest-runs`, `quota-reservations`, `ingest-recovery-runs`, `generation`, `run` and `recoveryAttempts` on IngestJobs, the import outcome on `scraper-runs`) are generated with `make migrate-create`.
- Existing IngestJobs get generation 0 and no run. Post-review jobs already queued at deploy time carry no generation and are accepted as generation 0.
- Deploy with an empty ingest queue: the release notes tell operators to wait until no ingest is running. A source job that was mid-`processSheets` under the old code is not resumable. The recovery job reports it, and it is resolved by requeueing.

## Implementation order

Each step ends with `make check-ai`, `make test-ai` and a review round, and is merged on its own.

1. Idempotency fixes in the task handlers, still under `processSheets`. They are correct on their own and are the precondition for retries.
2. `ingest-runs`, generations and transactional dispatch; children run as `ingest-process`; `processSheets` is deleted.
3. `reconcileRun` with manual, scheduled and scraper bookkeeping, the scheduled feed halt and the reconcile-failed-ingests switch. Steps 2 and 3 merge together: once the source workflows only dispatch, the scheduled bookkeeping depends on `reconcileRun`.
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
- A running workflow touches its job while a task waits, and stops once the handler returns.

## Consequences

- Every first import gets the retry behaviour that only resumptions had, and one bad sheet no longer takes its siblings down.
- The pipeline gains two tables and a reconciliation step; the source workflows shrink to dispatch.
- Scheduled feeds stop fetching while a review is open, which delays data for feeds whose reviews sit unattended.
- A sheet that keeps failing disables its whole feed, including the sheets that import fine.
- Abandoned jobs stay stuck until an operator runs `timetiles ingest recover --apply`.
- Payload upgrades must recheck task restoration, `onFail` ordering and workflow error handling, on which this design depends.
