/**
 * Prior-state snapshots for update-strategy event imports (all-or-nothing).
 *
 * Under `duplicateStrategy: "update"`, {@link tryUpdateExistingEvent} overwrites
 * pre-existing events in place. If the import then fails permanently, those
 * events are left half-mutated with their originals gone — `cleanupPriorAttempt`
 * can only delete this run's fresh INSERTs (it deliberately keeps the updated
 * originals to avoid deleting real data). This store closes that gap: before an
 * event is overwritten its original field values are captured (once per run,
 * idempotently) to a per-job JSONL sidecar on the shared uploads volume. On a
 * terminal failure — and at the start of every retry — the snapshots are
 * restored, reverting the originals; on success they are discarded.
 *
 * The sidecar lives on the same host-mounted uploads volume the ingest file
 * uses, so it survives worker restarts and is visible to whichever worker runs
 * the retry / onFail (no new collection or migration required).
 *
 * Concurrency scope: every per-event mutation (capture+update, restore, delete)
 * is atomic under a row lock, which makes the rollback correct for a single
 * import and for SEQUENTIAL imports to the same dataset. Row locks alone do NOT
 * cover two update-strategy imports mutating the SAME event CONCURRENTLY and both
 * failing: their snapshots form a chain (A snapshots the original, B snapshots
 * A's value), and a non-LIFO rollback (A reverts first — skipped as no longer
 * owned — then B reverts to A's value) would leave the failed intermediate rather
 * than the true original. That cross-import case is handled one level up: the
 * create-events handler serializes EVERY import on a per-dataset lease (see
 * `@/lib/database/dataset-import-lock`) across its whole mutate-then-rollback
 * phase — including the rollback in its catch AND in onFail — so B cannot begin
 * capturing until A has finished or rolled back, and B always snapshots the true
 * original. Serializing all strategies (not just update) also closes the mixed
 * case where a skip import inserts an event a concurrent update adopts on conflict.
 *
 * Worker-crash safety: if A's worker dies mid-import, Postgres frees the session
 * lock immediately while A's committed overwrites stay live — the lock alone would
 * be fail-open. The durable marker that closes this is the SNAPSHOT SIDECAR itself:
 * its filename encodes the dataset (see {@link snapshotPath}) and it survives on the
 * shared volume, so the next holder of the dataset lease calls
 * {@link EventSnapshotStore.repairAbandonedSnapshots} to restore any abandoned
 * predecessor BEFORE mutating. The repair is status-aware: a sidecar from a job
 * that already reached a terminal-SUCCESS stage (its own discard merely failed) is
 * deleted, NOT replayed — replaying would roll back a completed import. A crash
 * therefore becomes "next holder repairs first" rather than "B captures a
 * half-applied value".
 *
 * Crash-recovery residuals (all narrow; closing them needs a heavier active-import
 * marker and/or filesystem fencing than the sidecar provides):
 * - The sidecar only exists for UPDATE imports, so a crashed pure-SKIP import
 *   leaves fresh inserts with no marker to discover; and repair reverts a crashed
 *   update's overwrites but not its fresh inserts. Both are otherwise cleaned when
 *   that job is retried (attempt-start cleanup deletes its own inserts) — the gap
 *   is only a job that crashes AND is never retried while a concurrent import
 *   adopts its insert.
 * - The FS write (append) and the advisory lock share no durability/visibility
 *   boundary: a host/kernel/storage crash with a lost page cache, a network-volume
 *   with delayed directory visibility, or loss of only the lease DB session (no
 *   fencing token) can let a holder miss a just-written marker. Adequate for a
 *   plain process crash on a coherent local volume, which is the realistic case.
 *
 * Scope of the guarantee: the BUSINESS fields (see {@link SNAPSHOT_FIELDS}) are
 * restored exactly, and the restore is race-safe (each event is reverted under a
 * row lock, only while still owned by this job). Two effects are intentionally
 * NOT undone:
 * - The restore is a normal Payload update, so it bumps `updatedAt` and leaves
 *   the failed intermediate in the event's version history. Reverting those would
 *   require low-level version-table surgery that risks corrupting Payload's
 *   draft/latest bookkeeping, so it is out of scope here.
 * - Orphaned sidecars from a hard-crashed (never retried, never onFail'd) job are
 *   possible; `discard` logs (does not swallow) a failed delete, and the
 *   ownership-guarded restore limits the blast radius if a stale one is replayed.
 *
 * @module
 * @category Jobs
 */
import type { Dirent } from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { eq } from "@payloadcms/db-postgres/drizzle";
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";

import { getEnv } from "@/lib/config/env";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import type { createJobLogger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import { events as eventsTable } from "@/payload-generated-schema";

/** Exact set of event fields {@link tryUpdateExistingEvent} overwrites — captured and restored verbatim. */
const SNAPSHOT_FIELDS = [
  "dataset",
  "datasetIsPublic",
  "catalogOwnerId",
  "uniqueId",
  "transformedData",
  "sourceData",
  "location",
  "locationName",
  "coordinateSource",
  "eventTimestamp",
  "eventEndTimestamp",
  "validationStatus",
  "transformations",
  "schemaVersionNumber",
  "contentHash",
  "ingestJob",
] as const;

type SnapshotData = Record<string, unknown>;
type Logger = ReturnType<typeof createJobLogger>;

const snapshotsDir = (): string => path.resolve(process.cwd(), getEnv().UPLOAD_DIR, "ingest-snapshots");

// Sidecar filename = `<dataset-prefix><jobId>.jsonl`. Encoding the dataset makes a
// crashed import's sidecar discoverable by the NEXT holder of that dataset's lease,
// which is what lets it repair an abandoned predecessor before mutating (closing the
// worker-crash fail-open gap). The `-job` delimiter keeps `ds5-job*` from matching
// `ds55-job*`. See {@link EventSnapshotStore.repairAbandonedSnapshots}.
const datasetSidecarPrefix = (datasetId: string | number): string => `ds${String(datasetId)}-job`;
const SNAPSHOT_SUFFIX = ".jsonl";

const snapshotPath = (datasetId: string | number, ingestJobId: string | number): string =>
  path.join(snapshotsDir(), `${datasetSidecarPrefix(datasetId)}${String(ingestJobId)}${SNAPSHOT_SUFFIX}`);

/** Pick only the overwrite-affected fields from a full event doc. */
const extractSnapshot = (doc: Record<string, unknown>): SnapshotData => {
  const snapshot: SnapshotData = {};
  for (const field of SNAPSHOT_FIELDS) {
    snapshot[field] = (doc as SnapshotData)[field] ?? null;
  }
  return snapshot;
};

/**
 * Per-run recorder of event prior-state. Appends one JSONL line per event the
 * first time it is about to be updated in this run; ignores subsequent touches
 * of the same event so the captured value is always the true original.
 */
export class EventSnapshotStore {
  private readonly capturedIds = new Set<number>();
  private dirEnsured = false;

  constructor(
    private readonly datasetId: string | number,
    private readonly ingestJobId: string | number,
    private readonly log: Logger
  ) {}

  /**
   * Capture the current state of `eventId` before it is overwritten, unless it
   * was already captured in this run. Pass the caller's transaction `req` so the
   * read sees the row the caller has locked `FOR UPDATE` — that makes the
   * capture+update atomic w.r.t. a concurrent import, so the snapshot always
   * reflects the exact state we are about to overwrite. Rethrows on write failure
   * so the caller aborts the update rather than mutate an event whose original
   * was never recorded.
   */
  async capture(
    payload: Payload,
    eventId: number | string,
    req?: Pick<PayloadRequest, "payload" | "transactionID" | "context">
  ): Promise<void> {
    const id = Number(eventId);
    if (this.capturedIds.has(id)) return;

    const prior = req
      ? await payload.findByID({ collection: "events", id, depth: 0, overrideAccess: true, req })
      : await asSystem(payload).findByID({ collection: "events", id, depth: 0 });
    if (!prior) return;

    const line = `${JSON.stringify({ id, data: extractSnapshot(prior as unknown as Record<string, unknown>) })}\n`;
    if (!this.dirEnsured) {
      await fsPromises.mkdir(snapshotsDir(), { recursive: true });
      this.dirEnsured = true;
    }
    await fsPromises.appendFile(snapshotPath(this.datasetId, this.ingestJobId), line, "utf-8");
    this.capturedIds.add(id);
  }

  /** Delete the snapshot sidecar — call after a successful import (updates are final). */
  async discard(): Promise<void> {
    await EventSnapshotStore.discard(this.datasetId, this.ingestJobId, this.log);
  }

  static async discard(datasetId: string | number, ingestJobId: string | number, log: Logger): Promise<void> {
    try {
      await fsPromises.rm(snapshotPath(datasetId, ingestJobId), { force: true });
    } catch (error) {
      // Not swallowed to a low level: a surviving sidecar could be replayed if
      // this job id is ever re-run, rolling back data that was already final.
      log.error("Failed to discard event snapshots; a re-run could replay them", { ingestJobId, error });
    }
  }

  /**
   * Restore snapshotted events to their captured originals, then delete the
   * sidecar. Idempotent and safe to call when no sidecar exists (no-op). Used at
   * the start of every attempt (revert a prior attempt's updates) and on terminal
   * failure (revert this attempt's updates).
   *
   * Two safety rules:
   * - Atomic conditional restore: each event is locked (`SELECT … FOR UPDATE`) and
   *   reverted ONLY if it is still owned by THIS job (`ingestJob` unchanged),
   *   within one transaction — so a concurrent import that re-wrote it can neither
   *   be clobbered nor slip in between the ownership check and the write.
   * - Keep-on-failure: if ANY line fails to parse or restore, the sidecar is NOT
   *   deleted, so the next attempt / onFail can retry from the true originals. The
   *   returned `failures` also tells `cleanupPriorAttempt` NOT to run its
   *   insert-deletion (a still-owned, not-yet-reverted event would otherwise be
   *   mistaken for a fresh insert and deleted).
   *
   * @returns counts of successfully restored events and hard failures.
   */
  static async restoreAndClear(
    payload: Payload,
    datasetId: string | number,
    ingestJobId: string | number,
    log: Logger
  ): Promise<{ restored: number; failures: number }> {
    const file = snapshotPath(datasetId, ingestJobId);
    let contents: string;
    try {
      contents = await fsPromises.readFile(file, "utf-8");
    } catch (error) {
      // No sidecar (the common case: skip-strategy or first attempt) → nothing to do.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { restored: 0, failures: 0 };
      throw error;
    }

    let restored = 0;
    let failures = 0;
    const thisJobId = Number(ingestJobId);
    for (const line of contents.split("\n")) {
      if (line.trim() === "") continue;
      let entry: { id: number; data: SnapshotData };
      try {
        entry = JSON.parse(line) as { id: number; data: SnapshotData };
      } catch (error) {
        log.warn("Skipping unparseable event snapshot line", { ingestJobId, error });
        failures++;
        continue;
      }
      const outcome = await restoreEventUnderLock(payload, ingestJobId, entry, thisJobId, log);
      if (outcome === "restored") restored++;
      else if (outcome === "failed") failures++;
    }

    if (failures === 0) {
      await fsPromises.rm(file, { force: true });
    } else {
      log.error("Kept event-snapshot sidecar after restore failures; will retry on next attempt/onFail", {
        ingestJobId,
        restored,
        failures,
      });
    }
    if (restored > 0) log.info("Restored events from prior-state snapshots", { ingestJobId, restored });
    return { restored, failures };
  }

  /**
   * Repair snapshots abandoned by OTHER jobs on this dataset, before the caller
   * mutates it. A worker that crashes mid-import frees its advisory lock (Postgres
   * drops session locks on disconnect) while its committed overwrites stay live and
   * its sidecar survives on the shared volume. The next holder of the dataset lease
   * calls this to restore those overwrites to their true originals, so it never
   * captures a crashed predecessor's intermediate value — closing the worker-crash
   * fail-open gap. It also mops up a sidecar a previous holder kept because ITS own
   * catch/onFail restore failed (see restoreAndClear's keep-on-failure rule).
   *
   * Safe because the caller holds the dataset lease: no other import can be mid
   * mutation, so any sidecar for this dataset other than the caller's is from a job
   * that already released the lock (crashed or failed to clean up). Each restore is
   * additionally row-lock + ownership guarded.
   *
   * @returns the count of abandoned jobs repaired and total hard failures; a
   * non-zero `failures` tells the caller to ABORT rather than mutate a dirty dataset.
   */
  static async repairAbandonedSnapshots(
    payload: Payload,
    datasetId: string | number,
    currentJobId: string | number,
    log: Logger
  ): Promise<{ repairedJobs: number; failures: number }> {
    const prefix = datasetSidecarPrefix(datasetId);
    let entries: Dirent[];
    try {
      entries = await fsPromises.readdir(snapshotsDir(), { withFileTypes: true });
    } catch (error) {
      // No snapshots dir yet → nothing abandoned.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { repairedJobs: 0, failures: 0 };
      throw error;
    }

    const currentJobIdStr = String(currentJobId);
    let repairedJobs = 0;
    let failures = 0;
    for (const entry of entries) {
      const abandonedJobId = EventSnapshotStore.parseSidecarJobId(entry, prefix);
      if (abandonedJobId == null || abandonedJobId === currentJobIdStr) continue;

      // Status-aware: a sidecar left by a job that already SUCCEEDED (its own
      // discard just failed) must NOT be replayed — restoring would roll back a
      // completed import. Only jobs that did not reach a terminal-success state get
      // their overwrites reverted; a completed job's leftover is merely deleted.
      if (await EventSnapshotStore.reachedTerminalSuccess(payload, abandonedJobId)) {
        log.warn("Discarding a completed import's leftover sidecar (its discard had failed)", {
          datasetId,
          abandonedJobId,
          currentJobId,
        });
        await EventSnapshotStore.discard(datasetId, abandonedJobId, log);
        continue;
      }

      log.warn("Repairing snapshots abandoned by a crashed/failed prior import on this dataset", {
        datasetId,
        abandonedJobId,
        currentJobId,
      });
      const { failures: jobFailures } = await EventSnapshotStore.restoreAndClear(
        payload,
        datasetId,
        abandonedJobId,
        log
      );
      if (jobFailures > 0) failures += jobFailures;
      else repairedJobs++;
    }
    return { repairedJobs, failures };
  }

  /**
   * Extract the job id from a sidecar dirent for this dataset, or null if the entry
   * is not one of our sidecars. Strict: a real file whose name is exactly
   * `<prefix><digits>.jsonl` — rejects directories and stray names like
   * `ds5-jobbackup.jsonl` (which would otherwise be treated as job "backup" and
   * either deleted or fail-close the dataset).
   */
  private static parseSidecarJobId(entry: Dirent, prefix: string): string | null {
    if (!entry.isFile() || !entry.name.startsWith(prefix)) return null;
    const match = /^(\d+)\.jsonl$/.exec(entry.name.slice(prefix.length));
    return match ? match[1]! : null;
  }

  /**
   * True if `jobId` reached a terminal-SUCCESS stage (completed / needs-review), so
   * a leftover sidecar is a failed-discard remnant, not a crash to roll back. A
   * missing job is treated as success (do NOT roll back — we can't confirm it
   * failed, and reverting a possibly-completed import would corrupt data). A read
   * error propagates so the caller aborts rather than guessing.
   */
  private static async reachedTerminalSuccess(payload: Payload, jobId: string): Promise<boolean> {
    const result = await payload.find({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: { id: { equals: Number(jobId) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const stage = (result.docs[0] as { stage?: string } | undefined)?.stage;
    if (stage == null) return true; // job gone / unreadable id → don't restore
    return stage === PROCESSING_STAGE.COMPLETED || stage === PROCESSING_STAGE.NEEDS_REVIEW;
  }
}

/**
 * Revert one event to its snapshot iff it is still owned by this job, locking the
 * row for the check+write so a concurrent update cannot race in between.
 */
const restoreEventUnderLock = async (
  payload: Payload,
  ingestJobId: string | number,
  entry: { id: number; data: SnapshotData },
  thisJobId: number,
  log: Logger
): Promise<"restored" | "skipped" | "failed"> => {
  const req = { payload, transactionID: undefined, context: {} } as Pick<
    PayloadRequest,
    "payload" | "transactionID" | "context"
  >;
  const ownsTransaction = await initTransaction(req);
  try {
    const drizzle = await getTransactionAwareDrizzle(payload, req);
    const rows = (await drizzle
      .select({ ingestJob: eventsTable.ingestJob })
      .from(eventsTable)
      .where(eq(eventsTable.id, entry.id))
      .for("update")) as Array<{ ingestJob: number | null }>;

    const current = rows[0];
    // Event vanished independently, or a concurrent import claimed/cleared it —
    // either way our rollback must not touch it (not a failure).
    if (current?.ingestJob == null || Number(current.ingestJob) !== thisJobId) {
      if (current != null) {
        log.info("Skipping snapshot restore; event no longer owned by this import", {
          ingestJobId,
          eventId: entry.id,
          currentOwner: current.ingestJob,
        });
      }
      if (ownsTransaction) await commitTransaction(req);
      return "skipped";
    }

    await payload.update({ collection: "events", id: entry.id, data: entry.data, overrideAccess: true, req });
    if (ownsTransaction) await commitTransaction(req);
    return "restored";
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    log.warn("Failed to restore event snapshot", { ingestJobId, eventId: entry.id, error });
    return "failed";
  }
};
