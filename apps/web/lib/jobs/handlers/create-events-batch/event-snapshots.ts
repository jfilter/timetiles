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
 * @module
 * @category Jobs
 */
import fsPromises from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config/env";
import type { createJobLogger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import type { Event } from "@/payload-types";
import type { Payload } from "payload";

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

const snapshotPath = (ingestJobId: string | number): string =>
  path.join(snapshotsDir(), `job-${String(ingestJobId)}.jsonl`);

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
    private readonly ingestJobId: string | number,
    private readonly log: Logger
  ) {}

  /**
   * Capture the current state of `eventId` before it is overwritten, unless it
   * was already captured in this run. Best-effort: a snapshot write failure is
   * logged and rethrown so the caller can abort the update rather than mutate an
   * event whose original was never recorded.
   */
  async capture(payload: Payload, eventId: number | string): Promise<void> {
    const id = Number(eventId);
    if (this.capturedIds.has(id)) return;

    const prior = await asSystem(payload).findByID({ collection: "events", id, depth: 0 });
    if (!prior) return;

    const line = `${JSON.stringify({ id, data: extractSnapshot(prior as unknown as Record<string, unknown>) })}\n`;
    if (!this.dirEnsured) {
      await fsPromises.mkdir(snapshotsDir(), { recursive: true });
      this.dirEnsured = true;
    }
    await fsPromises.appendFile(snapshotPath(this.ingestJobId), line, "utf-8");
    this.capturedIds.add(id);
  }

  /** Delete the snapshot sidecar — call after a successful import (updates are final). */
  async discard(): Promise<void> {
    await EventSnapshotStore.discard(this.ingestJobId, this.log);
  }

  static async discard(ingestJobId: string | number, log: Logger): Promise<void> {
    try {
      await fsPromises.rm(snapshotPath(ingestJobId), { force: true });
    } catch (error) {
      log.warn("Failed to discard event snapshots", { ingestJobId, error });
    }
  }

  /**
   * Restore every snapshotted event to its captured original, then delete the
   * sidecar. Idempotent and safe to call when no sidecar exists (no-op). Used at
   * the start of every attempt (revert a prior attempt's updates) and on terminal
   * failure (revert this attempt's updates). Returns the number restored.
   */
  static async restoreAndClear(payload: Payload, ingestJobId: string | number, log: Logger): Promise<number> {
    const file = snapshotPath(ingestJobId);
    let contents: string;
    try {
      contents = await fsPromises.readFile(file, "utf-8");
    } catch (error) {
      // No sidecar (the common case: skip-strategy or first attempt) → nothing to do.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }

    let restored = 0;
    for (const line of contents.split("\n")) {
      if (line.trim() === "") continue;
      let entry: { id: number; data: SnapshotData };
      try {
        entry = JSON.parse(line) as { id: number; data: SnapshotData };
      } catch (error) {
        log.warn("Skipping unparseable event snapshot line", { ingestJobId, error });
        continue;
      }
      try {
        await asSystem(payload).update({ collection: "events", id: entry.id, data: entry.data as Partial<Event> });
        restored++;
      } catch (error) {
        // The event may have been deleted independently; log and continue so one
        // missing row cannot block reverting the rest.
        log.warn("Failed to restore event snapshot", { ingestJobId, eventId: entry.id, error });
      }
    }

    await fsPromises.rm(file, { force: true });
    if (restored > 0) log.info("Restored events from prior-state snapshots", { ingestJobId, restored });
    return restored;
  }
}
