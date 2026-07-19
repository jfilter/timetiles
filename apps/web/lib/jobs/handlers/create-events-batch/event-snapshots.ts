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
 * lock immediately while A's committed overwrites AND fresh inserts stay live — the
 * lock alone would be fail-open. The durable marker that closes this is the SIDECAR
 * itself: EVERY import writes one on acquire ({@link markActive}) — even a skip
 * import that captures no overwrites — and its filename encodes the dataset (see
 * {@link snapshotPath}), so it survives on the shared volume and is discoverable per
 * dataset. The next holder of the dataset lease calls `repairAbandonedImports`
 * (job-completion) to fully roll each abandoned predecessor back via
 * `cleanupPriorAttempt` (restore overwrites + delete fresh inserts) BEFORE mutating.
 * The repair is status-aware: a sidecar from a job that already reached a
 * terminal-SUCCESS stage (its own discard merely failed) is deleted, NOT replayed —
 * replaying would roll back a completed import. A crash therefore becomes "next
 * holder repairs first" rather than "B captures a half-applied value or adopts a
 * stranded insert".
 *
 * Residuals (both narrow):
 * - The FS write (append) and the advisory lock share no durability/visibility
 *   boundary: a host/kernel/storage crash with a lost page cache, a network-volume
 *   with delayed directory visibility, or loss of only the lease DB session (no
 *   fencing token) can let a holder miss a just-written marker. Adequate for a
 *   plain process crash on a coherent local volume, which is the realistic case.
 * - The ownership guard keys on `ingestJob`, so a restore is correct against a
 *   concurrent import (which replaces `ingestJob`) but would overwrite a third
 *   party who edits an event's business fields while leaving `ingestJob` untouched
 *   — outside the "imports own their events" invariant this code assumes.
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

  /**
   * Eagerly create the (empty) sidecar so this import is discoverable as an active
   * holder of the dataset even BEFORE/without any overwrite capture — a crash then
   * still leaves a marker for the next holder to repair (covers skip imports and an
   * update import that inserted rows before its first overwrite). Call AFTER the
   * attempt-start cleanup (so it is not immediately cleared) and BEFORE mutating.
   */
  async markActive(): Promise<void> {
    if (!this.dirEnsured) {
      await fsPromises.mkdir(snapshotsDir(), { recursive: true });
      this.dirEnsured = true;
    }
    // Append "" — creates the file if missing, without truncating an existing one.
    await fsPromises.appendFile(snapshotPath(this.datasetId, this.ingestJobId), "", "utf-8");
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
   * List the job ids of sidecars on this dataset that belong to OTHER imports — i.e.
   * abandoned markers from imports that already released the dataset lease (crashed,
   * or failed to clean up). Every import writes a sidecar marker on acquire (see
   * {@link markActive}), so this discovers crashed SKIP imports too, not just ones
   * that captured overwrites. The caller (holding the lease) repairs each via
   * `repairAbandonedImports`. Excludes the caller's own sidecar and any stray file.
   *
   * Safe because the caller holds the dataset lease: no other import can be mid
   * mutation, so any sidecar for this dataset other than the caller's is abandoned.
   */
  static async listAbandonedJobIds(datasetId: string | number, currentJobId: string | number): Promise<string[]> {
    const prefix = datasetSidecarPrefix(datasetId);
    let entries: Dirent[];
    try {
      entries = await fsPromises.readdir(snapshotsDir(), { withFileTypes: true });
    } catch (error) {
      // No snapshots dir yet → nothing abandoned.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const currentJobIdStr = String(currentJobId);
    const jobIds: string[] = [];
    for (const entry of entries) {
      const jobId = EventSnapshotStore.parseSidecarJobId(entry, prefix);
      if (jobId != null && jobId !== currentJobIdStr) jobIds.push(jobId);
    }
    return jobIds;
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
