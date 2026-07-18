/**
 * Unit tests for EventSnapshotStore (all-or-nothing rollback for update imports).
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

/** Minimal in-memory events store fronting a payload-shaped mock. */
const makeMockPayload = (events: Map<number, Record<string, unknown>>) =>
  ({
    findByID: ({ id }: { id: number | string }) => Promise.resolve(events.get(Number(id)) ?? null),
    update: ({ id, data }: { id: number | string; data: Record<string, unknown> }) => {
      const current = events.get(Number(id)) ?? { id: Number(id) };
      const next = { ...current, ...data };
      events.set(Number(id), next);
      return Promise.resolve(next);
    },
  }) as never;

describe.sequential("EventSnapshotStore", () => {
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

  const snapshotFile = (jobId: string | number) => path.join(tmpDir, "ingest-snapshots", `job-${jobId}.jsonl`);

  it("captures an original then restores it, reverting an in-place update", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [10, { id: 10, uniqueId: "u10", transformedData: { v: "ORIG" }, locationName: "Old Town", ingestJob: 1 }],
    ]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("99", log);

    await store.capture(payload, 10);
    // Simulate the in-place update overwriting the event.
    events.set(10, { id: 10, uniqueId: "u10", transformedData: { v: "NEW" }, locationName: "New City", ingestJob: 99 });

    const restored = await EventSnapshotStore.restoreAndClear(payload, "99", log);

    expect(restored).toBe(1);
    expect(events.get(10)?.transformedData).toEqual({ v: "ORIG" });
    expect(events.get(10)?.locationName).toBe("Old Town");
    expect(events.get(10)?.ingestJob).toBe(1);
    // Sidecar is cleared after restore.
    await expect(fsPromises.access(snapshotFile("99"))).rejects.toThrow();
  });

  it("captures each event's original only once (idempotent across retouches)", async () => {
    const events = new Map<number, Record<string, unknown>>([[7, { id: 7, transformedData: { v: "ORIG" } }]]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("42", log);

    await store.capture(payload, 7);
    // A second update of the same event within the run must NOT re-snapshot the
    // already-modified state.
    events.set(7, { id: 7, transformedData: { v: "MODIFIED" } });
    await store.capture(payload, 7);

    const contents = await fsPromises.readFile(snapshotFile("42"), "utf-8");
    const lines = contents.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(1);

    await EventSnapshotStore.restoreAndClear(payload, "42", log);
    expect(events.get(7)?.transformedData).toEqual({ v: "ORIG" });
  });

  it("discard removes the sidecar without restoring", async () => {
    const events = new Map<number, Record<string, unknown>>([[3, { id: 3, transformedData: { v: "ORIG" } }]]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("5", log);

    await store.capture(payload, 3);
    events.set(3, { id: 3, transformedData: { v: "KEPT" } });

    await store.discard();

    // No restore happened; the (final) update is kept.
    expect(events.get(3)?.transformedData).toEqual({ v: "KEPT" });
    await expect(fsPromises.access(snapshotFile("5"))).rejects.toThrow();
  });

  it("restoreAndClear is a no-op when no sidecar exists", async () => {
    const payload = makeMockPayload(new Map());
    const restored = await EventSnapshotStore.restoreAndClear(payload, "no-file", log);
    expect(restored).toBe(0);
  });

  it("skips unparseable lines but restores the valid ones", async () => {
    const events = new Map<number, Record<string, unknown>>([[1, { id: 1, transformedData: { v: "NEW" } }]]);
    const payload = makeMockPayload(events);
    const dir = path.join(tmpDir, "ingest-snapshots");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "job-bad.jsonl"),
      `not-json\n${JSON.stringify({ id: 1, data: { transformedData: { v: "ORIG" } } })}\n`,
      "utf-8"
    );

    const restored = await EventSnapshotStore.restoreAndClear(payload, "bad", log);

    expect(restored).toBe(1);
    expect(events.get(1)?.transformedData).toEqual({ v: "ORIG" });
  });
});
