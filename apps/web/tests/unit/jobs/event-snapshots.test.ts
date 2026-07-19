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

/** Minimal payload mock supporting only `capture`'s findByID. */
const makeMockPayload = (events: Map<number, Record<string, unknown>>) =>
  ({ findByID: ({ id }: { id: number | string }) => Promise.resolve(events.get(Number(id)) ?? null) }) as never;

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

  const snapshotFile = (jobId: string | number) => path.join(tmpDir, "ingest-snapshots", `job-${jobId}.jsonl`);
  const writeSidecar = async (jobId: string, body: string) => {
    const dir = path.join(tmpDir, "ingest-snapshots");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, `job-${jobId}.jsonl`), body, "utf-8");
  };

  it("captures each event's original only once (idempotent across retouches)", async () => {
    const events = new Map<number, Record<string, unknown>>([
      [7, { id: 7, transformedData: { v: "ORIG" }, ingestJob: 42 }],
    ]);
    const payload = makeMockPayload(events);
    const store = new EventSnapshotStore("42", log);

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
    const store = new EventSnapshotStore("5", log);
    await store.capture(makeMockPayload(new Map([[3, { id: 3, transformedData: { v: "ORIG" } }]])), 3);

    await store.discard();

    await expect(fsPromises.access(snapshotFile("5"))).rejects.toThrow();
  });

  it("restoreAndClear is a no-op (0/0) when no sidecar exists", async () => {
    const result = await EventSnapshotStore.restoreAndClear(makeMockPayload(new Map()), "no-file", log);
    expect(result).toEqual({ restored: 0, failures: 0 });
  });

  it("keeps the sidecar and reports failures when a line cannot be parsed", async () => {
    await writeSidecar("55", "not-json\nalso-not-json\n");

    const result = await EventSnapshotStore.restoreAndClear(makeMockPayload(new Map()), "55", log);

    expect(result.restored).toBe(0);
    expect(result.failures).toBe(2);
    // Sidecar survives so a later attempt can retry.
    await expect(fsPromises.access(snapshotFile("55"))).resolves.toBeUndefined();
  });
});
