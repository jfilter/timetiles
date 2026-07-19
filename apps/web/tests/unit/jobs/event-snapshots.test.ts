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
    const events = new Map<number, Record<string, unknown>>([
      [7, { id: 7, transformedData: { v: "ORIG" }, ingestJob: 42 }],
    ]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("42", log);

    await store.capture(payload, 7);
    // A second update of the same event within the run must NOT re-snapshot the
    // already-modified state (tryUpdateExistingEvent stamps ingestJob = this job).
    events.set(7, { id: 7, transformedData: { v: "MODIFIED" }, ingestJob: 42 });
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

  it("does NOT clobber an event a concurrent import re-wrote after us", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [20, { id: 20, transformedData: { v: "ORIG" }, ingestJob: 99 }],
    ]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("99", log);

    await store.capture(payload, 20);
    // A concurrent import (job 200) updates + claims the event, then succeeds.
    events.set(20, { id: 20, transformedData: { v: "FROM_J2" }, ingestJob: 200 });

    const restored = await EventSnapshotStore.restoreAndClear(payload, "99", log);

    // Our rollback must leave J2's newer data intact.
    expect(restored).toBe(0);
    expect(events.get(20)?.transformedData).toEqual({ v: "FROM_J2" });
    expect(events.get(20)?.ingestJob).toBe(200);
    // No failures → sidecar cleared.
    await expect(fsPromises.access(snapshotFile("99"))).rejects.toThrow();
  });

  it("does NOT restore when the event's ingestJob was cleared (strict ownership)", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [21, { id: 21, transformedData: { v: "ORIG" }, ingestJob: 99 }],
    ]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("99", log);

    await store.capture(payload, 21);
    // A concurrent op cleared ownership — our rollback must not reclaim it.
    events.set(21, { id: 21, transformedData: { v: "OTHER" }, ingestJob: null });

    const restored = await EventSnapshotStore.restoreAndClear(payload, "99", log);

    expect(restored).toBe(0);
    expect(events.get(21)?.transformedData).toEqual({ v: "OTHER" });
  });

  it("keeps the sidecar when a restore fails so a retry can revert later", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [30, { id: 30, transformedData: { v: "ORIG" }, ingestJob: 55 }],
    ]);
    // Payload whose update always fails (transient DB error).
    const payload = {
      findByID: ({ id }: { id: number }) => Promise.resolve(events.get(Number(id)) ?? null),
      update: () => Promise.reject(new Error("transient db error")),
    } as never;
    const store = new EventSnapshotStore("55", log);

    await store.capture(payload, 30);
    events.set(30, { id: 30, transformedData: { v: "MODIFIED" }, ingestJob: 55 });

    const restored = await EventSnapshotStore.restoreAndClear(payload, "55", log);

    expect(restored).toBe(0);
    // Sidecar must survive so the next attempt / onFail can retry the rollback.
    await expect(fsPromises.access(snapshotFile("55"))).resolves.toBeUndefined();
  });

  it("skips unparseable lines but restores the valid ones", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [1, { id: 1, transformedData: { v: "NEW" }, ingestJob: 77 }],
    ]);
    const payload = makeMockPayload(events);
    const dir = path.join(tmpDir, "ingest-snapshots");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "job-77.jsonl"),
      `not-json\n${JSON.stringify({ id: 1, data: { transformedData: { v: "ORIG" }, ingestJob: 77 } })}\n`,
      "utf-8"
    );

    const restored = await EventSnapshotStore.restoreAndClear(payload, "77", log);

    expect(restored).toBe(1);
    expect(events.get(1)?.transformedData).toEqual({ v: "ORIG" });
  });
});
