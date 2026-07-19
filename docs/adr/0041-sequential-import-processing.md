# ADR 0041: Sequential Import Processing Per Dataset

## Status

Accepted (2026-07-19) — enforced by the per-dataset advisory lock in `apps/web/lib/database/dataset-import-lock.ts`, acquired for every import in the `create-events-batch` handler (`apps/web/lib/jobs/handlers/create-events-batch-job.ts`). The all-or-nothing rollback it enables lives in `create-events-batch/event-snapshots.ts` and `create-events-batch/job-completion.ts`.

## Context

Under the `update` duplicate strategy, an import overwrites pre-existing events in place. To make a failed import all-or-nothing, the create-events job snapshots each event's original values before overwriting it and restores them if the import fails permanently (or on the next retry).

That rollback is only well-defined when a single import mutates a dataset at a time. Two imports that overwrite the **same** event **concurrently** form a snapshot chain — import A snapshots the true original `O`, then import B snapshots A's value. If both fail, a non-LIFO rollback (A reverts first but is skipped because it no longer owns the event, then B reverts to A's value) leaves the failed intermediate rather than `O`. The original is lost.

The current architecture does **not** prevent this on its own:

- `processSheets` runs every sheet of one uploaded file concurrently (`Promise.allSettled`); if two sheets map to the same dataset, their create-events steps run at the same time.
- Two separately uploaded files targeting the same dataset are two independent workflow jobs that the worker can run concurrently.

We prototyped a cross-import crash-recovery mechanism (a durable per-dataset marker so the next import repairs a crashed predecessor before mutating). Repeated adversarial review showed it is a genuine distributed-systems problem: correct handling of at-least-once job redelivery, filesystem durability/visibility vs. the DB lock, lease-session loss without a fencing token, and ordered (LIFO) recovery of snapshot chains would require fencing tokens plus a transactional journal — effectively rebuilding the import pipeline as a crash-safe distributed transaction. That is disproportionate to a self-hosted geospatial event manager whose imports are, in practice, not concurrent on the same dataset.

## Decision

TimeTiles **serializes import processing per dataset**. Every create-events import acquires a per-dataset lease before mutating and holds it across its whole mutate-then-rollback phase, so **two imports never mutate the same dataset at once**. Imports to different datasets still run in parallel.

The lease is a Postgres **session-level advisory lock** (`pg_advisory_lock` family) keyed by a namespace hash + dataset id, taken on a dedicated connection pool isolated from Payload's work pool (so a lock-holder can always finish its work and release), acquired via `pg_try_advisory_lock` + backoff (so waiters never tie up a lease connection). A crashed worker's session drops and Postgres frees the lock automatically — no TTL, heartbeat, or fencing token.

Because imports are serialized, the all-or-nothing rollback only has to be correct for **one import and its retries**: a failed or crashed import reverts its own overwrites (and deletes its own fresh inserts) from its per-job snapshot sidecar on the next retry, in the handler catch, and in `onFail`. There is no concurrent import to interleave, so **cross-import crash-recovery is explicitly out of scope**.

## Consequences

- Concurrent imports to the **same** dataset are processed one-at-a-time (the second waits on the lease). For this application that is rare and the added latency is acceptable; correctness is the priority.
- Imports to **different** datasets are unaffected and fully parallel.
- The rollback is correct for the realistic failure modes — an import that fails or whose worker crashes is reverted by its own persistent-job retry.
- A small dedicated connection pool (max 10) is opened lazily for lock sessions; total Postgres connections stay bounded (work pool + lease pool).
- Two narrow residuals remain, both outside the "imports own their events and are serialized" invariant and both acceptable here: (1) filesystem-level failure modes with no shared durability boundary with the DB lock (host/kernel/storage crash with a lost page cache, a network volume with delayed directory visibility, or silent loss of only the lease DB session); (2) a third party that edits an event's business fields while leaving its `ingestJob` owner untouched would not be detected by the ownership-guarded restore.

## Alternatives considered

- **Cross-import crash-recovery marker** (durable per-dataset marker + repair-on-acquire). Rejected: correct crash-safety across at-least-once redelivery, FS fencing, and snapshot chains is a distributed-transaction rebuild, disproportionate to the concurrency this app actually sees. The prototype is preserved on the `codex-crash-recovery-experiment` git tag.
- **No serialization, accept the concurrency bug.** Rejected: concurrent overlapping failing update imports can silently lose the original event data.
- **Queue-level serialization** (a per-dataset Payload job concurrency key). Rejected for now: create-events runs as an inline task inside the per-file `process-sheets` workflow rather than as an independently queued job, so a per-dataset concurrency key does not map cleanly onto it. The advisory lock enforces the invariant at the mutation point uniformly across all import sources (multi-sheet and multi-file) and can be revisited if the pipeline moves to per-dataset queued jobs.
