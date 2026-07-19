// @vitest-environment node
/**
 * Integration test for all-or-nothing rollback of "update"-strategy imports.
 *
 * Drives the real `processEventBatch` update path so an existing event is
 * overwritten in place AND its original captured to a snapshot sidecar, then
 * verifies `EventSnapshotStore.restoreAndClear` (invoked by cleanupPriorAttempt
 * on a terminal failure) reverts the event to its original. Also covers the
 * success path, where the snapshot is discarded and the update is kept.
 *
 * @module
 */
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { EventSnapshotStore } from "@/lib/jobs/handlers/create-events-batch/event-snapshots";
import type { ProcessBatchContext } from "@/lib/jobs/handlers/create-events-batch/process-batch";
import { processEventBatch } from "@/lib/jobs/handlers/create-events-batch/process-batch";
import { createLogger } from "@/lib/logger";
import type { Dataset, IngestFile } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("update-strategy snapshot rollback", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  let owner: any;
  let dataset: Dataset;
  let ingestFile: IngestFile;
  let tmpDir: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    owner = users.owner;
    const { catalog } = await withCatalog(testEnv, { user: owner, name: "Rollback Catalog" });
    const { dataset: ds } = await withDataset(testEnv, catalog.id, { name: "Rollback Dataset" });
    dataset = ds;
    const { ingestFile: file } = await withIngestFile(testEnv, catalog.id, "title\nrow", {
      status: "completed",
      user: owner.id,
    });
    ingestFile = file;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "snap-rollback-"));
    vi.stubEnv("UPLOAD_DIR", tmpDir);
    resetEnv();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    resetEnv();
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  const seedEvent = async (uniqueId: string, title: string) =>
    payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        sourceData: { id: uniqueId, title },
        transformedData: { id: uniqueId, title },
        uniqueId,
        eventTimestamp: "2026-01-01T00:00:00.000Z",
      },
      overrideAccess: true,
    });

  const buildUpdateJob = async (uniqueId: string, existingEventId: number) =>
    payload.create({
      collection: "ingest-jobs",
      data: {
        ingestFile: ingestFile.id,
        dataset: dataset.id,
        stage: "create-events",
        sheetIndex: 0,
        configSnapshot: { idStrategy: { duplicateStrategy: "update" } },
        duplicates: { internal: [], external: [{ rowNumber: 0, uniqueId, existingEventId }] },
      },
      overrideAccess: true,
    });

  const titleOf = async (id: number): Promise<string | undefined> => {
    const doc = (await payload.findByID({ collection: "events", id, overrideAccess: true })) as {
      transformedData?: { title?: string };
    };
    return doc.transformedData?.title;
  };

  it("restores the original after an update when the snapshot is replayed (failure rollback)", async () => {
    const event = await seedEvent("rollback-id", "Original Title");
    const job = await buildUpdateJob("rollback-id", event.id);

    const store = new EventSnapshotStore(job.id, createLogger("snapshot-rollback-test"));
    const ctx: ProcessBatchContext = {
      payload,
      job,
      dataset,
      ingestJobId: job.id,
      accessFields: { datasetIsPublic: false, catalogOwnerId: owner.id as number },
      logger: createLogger("snapshot-rollback-test"),
      snapshotStore: store,
    };

    const result = await processEventBatch(ctx, [{ id: "rollback-id", title: "Overwritten Title" }], 0);
    expect(result.eventsUpdated).toBe(1);
    // The in-place update landed.
    expect(await titleOf(event.id)).toBe("Overwritten Title");
    // A snapshot sidecar was written.
    const sidecar = path.join(tmpDir, "ingest-snapshots", `job-${job.id}.jsonl`);
    await expect(fsPromises.access(sidecar)).resolves.toBeUndefined();

    // Simulate the terminal-failure path (cleanupPriorAttempt / onFail).
    const { restored } = await EventSnapshotStore.restoreAndClear(
      payload,
      job.id,
      createLogger("snapshot-rollback-test")
    );
    expect(restored).toBe(1);
    expect(await titleOf(event.id)).toBe("Original Title");
    await expect(fsPromises.access(sidecar)).rejects.toThrow();
  });

  it("does NOT clobber an event a concurrent import re-claimed (ownership-guarded restore)", async () => {
    const event = await seedEvent("concurrent-id", "Original Title");
    const jobA = await buildUpdateJob("concurrent-id", event.id);

    const store = new EventSnapshotStore(jobA.id, createLogger("snapshot-rollback-test"));
    const ctx: ProcessBatchContext = {
      payload,
      job: jobA,
      dataset,
      ingestJobId: jobA.id,
      accessFields: { datasetIsPublic: false, catalogOwnerId: owner.id as number },
      logger: createLogger("snapshot-rollback-test"),
      snapshotStore: store,
    };
    await processEventBatch(ctx, [{ id: "concurrent-id", title: "A Overwrote" }], 0);

    // A concurrent import B then re-claims + rewrites the same event and succeeds.
    const jobB = await buildUpdateJob("concurrent-id", event.id);
    await payload.update({
      collection: "events",
      id: event.id,
      data: { ingestJob: jobB.id, transformedData: { id: "concurrent-id", title: "B Wins" } },
      overrideAccess: true,
    });

    // jobA now fails and rolls back — its restore must SKIP the no-longer-owned
    // event, leaving B's newer data intact.
    const { restored } = await EventSnapshotStore.restoreAndClear(
      payload,
      jobA.id,
      createLogger("snapshot-rollback-test")
    );
    expect(restored).toBe(0);
    expect(await titleOf(event.id)).toBe("B Wins");
  });

  it("keeps the update and drops the snapshot on the success path (discard)", async () => {
    const event = await seedEvent("keep-id", "Keep Original");
    const job = await buildUpdateJob("keep-id", event.id);

    const store = new EventSnapshotStore(job.id, createLogger("snapshot-rollback-test"));
    const ctx: ProcessBatchContext = {
      payload,
      job,
      dataset,
      ingestJobId: job.id,
      accessFields: { datasetIsPublic: false, catalogOwnerId: owner.id as number },
      logger: createLogger("snapshot-rollback-test"),
      snapshotStore: store,
    };

    await processEventBatch(ctx, [{ id: "keep-id", title: "Kept Update" }], 0);
    await store.discard();

    const sidecar = path.join(tmpDir, "ingest-snapshots", `job-${job.id}.jsonl`);
    await expect(fsPromises.access(sidecar)).rejects.toThrow();
    // A later restore attempt is a no-op; the update stays.
    const { restored } = await EventSnapshotStore.restoreAndClear(
      payload,
      job.id,
      createLogger("snapshot-rollback-test")
    );
    expect(restored).toBe(0);
    expect(await titleOf(event.id)).toBe("Kept Update");
  });
});
