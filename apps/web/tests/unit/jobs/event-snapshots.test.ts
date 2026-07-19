/**
 * Unit tests for EventSnapshotStore file-level behavior (capture, discard,
 * keep-on-failure). The restore path uses a row-locked transaction and is
 * covered end-to-end against a real DB in the integration suite.
 *
 * @module
 * @category Tests
 */
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { EventSnapshotStore } from "@/lib/jobs/handlers/create-events-batch/event-snapshots";

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as never;

/** Minimal payload mock: `capture`'s findByID plus `find` for ingest-job stage lookups
 * (repairAbandonedSnapshots). `jobStages` maps jobId → stage; an absent id → no docs. */
const makeMockPayload = (events: Map<number, Record<string, unknown>>, jobStages: Map<number, string> = new Map()) =>
  ({
    findByID: ({ id }: { id: number | string }) => Promise.resolve(events.get(Number(id)) ?? null),
    find: ({ where }: { where?: { id?: { equals?: number } } }) => {
      const id = where?.id?.equals;
      const stage = id == null ? undefined : jobStages.get(Number(id));
      return Promise.resolve({ docs: stage == null ? [] : [{ id, stage }] });
    },
  }) as never;

const DATASET_ID = 99;

describe.sequential("EventSnapshotStore (file-level)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "evt-snap-"));
    vi.stubEnv("UPLOAD_DIR", tmpDir);
    resetEnv();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    resetEnv();
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  const snapshotFile = (jobId: string | number, datasetId: string | number = DATASET_ID) =>
    path.join(tmpDir, "ingest-snapshots", `ds${datasetId}-job${jobId}.jsonl`);
  const writeSidecar = async (jobId: string, body: string, datasetId: string | number = DATASET_ID) => {
    const dir = path.join(tmpDir, "ingest-snapshots");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, `ds${datasetId}-job${jobId}.jsonl`), body, "utf-8");
  };

  it("captures each event's original only once (idempotent across retouches)", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [7, { id: 7, transformedData: { v: "ORIG" }, ingestJob: 42 }],
    ]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore(DATASET_ID, "42", log);

    await store.capture(payload, 7);
    // A re-touch within the run must NOT re-snapshot the already-modified state.
    events.set(7, { id: 7, transformedData: { v: "MODIFIED" }, ingestJob: 42 });
    await store.capture(payload, 7);

    const contents = await fsPromises.readFile(snapshotFile("42"), "utf-8");
    const lines = contents.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(1);
    // The single captured line holds the TRUE original.
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: 7, data: { transformedData: { v: "ORIG" } } });
  });

  it("discard removes the sidecar", async () => {
    const store = new EventSnapshotStore(DATASET_ID, "5", log);
    await store.capture(makeMockPayload(new Map([[3, { id: 3, transformedData: { v: "ORIG" } }]])), 3);

    await store.discard();

    await expect(fsPromises.access(snapshotFile("5"))).rejects.toThrow();
  });

  it("restoreAndClear is a no-op (0/0) when no sidecar exists", async () => {
    const result = await EventSnapshotStore.restoreAndClear(makeMockPayload(new Map()), DATASET_ID, "no-file", log);
    expect(result).toEqual({ restored: 0, failures: 0 });
  });

  it("keeps the sidecar and reports failures when a line cannot be parsed", async () => {
    await writeSidecar("55", "not-json\nalso-not-json\n");

    const result = await EventSnapshotStore.restoreAndClear(makeMockPayload(new Map()), DATASET_ID, "55", log);

    expect(result.restored).toBe(0);
    expect(result.failures).toBe(2);
    // Sidecar survives so a later attempt can retry.
    await expect(fsPromises.access(snapshotFile("55"))).resolves.toBeUndefined();
  });

  it("repairAbandonedSnapshots targets only this dataset's OTHER numeric-job sidecars", async () => {
    await writeSidecar("88", "not-json\n"); // ds99-job88 — crashed predecessor, unparseable → failure, kept
    await writeSidecar("42", "not-json\n"); // ds99-job42 — the current job, must be skipped
    await writeSidecar("5", "not-json\n", 77); // ds77-job5 — different dataset, must be ignored
    await writeSidecar("backup", "not-json\n"); // ds99-jobbackup — non-numeric, must be ignored (stray file)

    // Job 88 crashed (non-terminal stage) → its overwrites get reverted.
    const payload = makeMockPayload(new Map(), new Map([[88, "create-events"]]));
    const result = await EventSnapshotStore.repairAbandonedSnapshots(payload, DATASET_ID, "42", log);

    // Only job 88 was processed (1 unparseable line → 1 failure); it is kept for retry.
    expect(result.failures).toBe(1);
    expect(result.repairedJobs).toBe(0);
    await expect(fsPromises.access(snapshotFile("88"))).resolves.toBeUndefined(); // kept (restore failed)
    await expect(fsPromises.access(snapshotFile("42"))).resolves.toBeUndefined(); // current job untouched
    await expect(fsPromises.access(snapshotFile("5", 77))).resolves.toBeUndefined(); // other dataset untouched
    await expect(fsPromises.access(snapshotFile("backup"))).resolves.toBeUndefined(); // stray file untouched
  });

  it("repairAbandonedSnapshots deletes a completed job's leftover sidecar WITHOUT restoring", async () => {
    // A sidecar from a job that already reached a terminal-success stage (its own
    // discard failed) must be dropped, not replayed — replaying would roll back a
    // completed import.
    await writeSidecar("90", '{"id":1,"data":{}}\n');
    const payload = makeMockPayload(new Map(), new Map([[90, "completed"]]));

    const result = await EventSnapshotStore.repairAbandonedSnapshots(payload, DATASET_ID, "1", log);

    expect(result).toEqual({ repairedJobs: 0, failures: 0 });
    // Sidecar deleted (and no restore attempted — the event Map is empty, so a
    // restore would have been a visible no-op on findByID; the point is deletion).
    await expect(fsPromises.access(snapshotFile("90"))).rejects.toThrow();
  });

  it("repairAbandonedSnapshots is a no-op when the snapshots dir does not exist", async () => {
    const result = await EventSnapshotStore.repairAbandonedSnapshots(makeMockPayload(new Map()), DATASET_ID, "1", log);
    expect(result).toEqual({ repairedJobs: 0, failures: 0 });
  });
});
