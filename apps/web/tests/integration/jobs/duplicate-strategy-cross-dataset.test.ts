// @vitest-environment node
/**
 * Integration test for the "update" duplicate-strategy cross-dataset guard.
 *
 * Verifies that `processEventBatch` refuses to mutate events that belong to
 * a different dataset — even when an IngestJob's `duplicates.external` payload
 * has been tampered with to point at a foreign event id. This covers the
 * defence-in-depth check added after code review, closing the silent
 * cross-dataset overwrite path.
 *
 * Setup: two datasets in two catalogs. An event lives in dataset A. An ingest
 * job targeting dataset B is constructed with `duplicates.external` pointing
 * at dataset A's event. Running the batch must leave dataset A's event
 * unchanged and record an error for the blocked row.
 *
 * @module
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describe.sequential("processEventBatch — cross-dataset update guard", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  let ownerA: any;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  let ownerB: any;
  let datasetA: Dataset;
  let datasetB: Dataset;
  let eventInDatasetAId: number;
  let eventAOriginalTitle: string;
  let ingestFileB: IngestFile;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { ownerA: { role: "user" }, ownerB: { role: "user" } });
    ownerA = users.ownerA;
    ownerB = users.ownerB;

    const { catalog: catalogA } = await withCatalog(testEnv, { user: ownerA, name: "Catalog A" });
    const { catalog: catalogB } = await withCatalog(testEnv, { user: ownerB, name: "Catalog B" });

    const { dataset: dsA } = await withDataset(testEnv, catalogA.id, { name: "Dataset A" });
    const { dataset: dsB } = await withDataset(testEnv, catalogB.id, { name: "Dataset B" });
    datasetA = dsA;
    datasetB = dsB;

    // Create an event owned by dataset A that should never be touched by a
    // dataset-B import, even if a tampered IngestJob targets its id.
    eventAOriginalTitle = "Event A Original";
    const eventA = await payload.create({
      collection: "events",
      data: {
        dataset: datasetA.id,
        sourceData: { id: "shared-unique-id", title: eventAOriginalTitle },
        transformedData: { id: "shared-unique-id", title: eventAOriginalTitle },
        uniqueId: "shared-unique-id",
        eventTimestamp: "2026-01-01T00:00:00.000Z",
      },
      overrideAccess: true,
    });
    eventInDatasetAId = eventA.id;

    // Dataset-B ingest file (content irrelevant — we're constructing the
    // IngestJob directly, not streaming from disk).
    const { ingestFile } = await withIngestFile(testEnv, catalogB.id, "title\nrow", {
      status: "completed",
      user: ownerB.id,
    });
    ingestFileB = ingestFile;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("blocks an update that targets an event in a different dataset", async () => {
    // Construct a tampered IngestJob pointing dataset B's duplicates.external
    // at dataset A's event id.
    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: {
        ingestFile: ingestFileB.id,
        dataset: datasetB.id,
        stage: "create-events",
        sheetIndex: 0,
        configSnapshot: { idStrategy: { duplicateStrategy: "update" } },
        duplicates: {
          internal: [],
          external: [{ rowNumber: 0, uniqueId: "shared-unique-id", existingEventId: eventInDatasetAId }],
        },
      },
      overrideAccess: true,
    });

    const ctx: ProcessBatchContext = {
      payload,
      job: ingestJob,
      dataset: datasetB,
      ingestJobId: ingestJob.id,
      accessFields: { datasetIsPublic: false, catalogOwnerId: ownerB.id as number },
      logger: createLogger("cross-dataset-guard-test"),
    };

    const result = await processEventBatch(
      ctx,
      [{ id: "shared-unique-id", title: "Hijacked Title From Dataset B" }],
      0
    );

    expect(result.eventsUpdated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.error).toMatch(/update blocked/);

    const eventAfter = (await payload.findByID({
      collection: "events",
      id: eventInDatasetAId,
      overrideAccess: true,
    })) as { transformedData?: { title?: string } };
    expect(eventAfter.transformedData?.title).toBe(eventAOriginalTitle);
  });

  it("allows an update that targets an event in the same dataset", async () => {
    // Create an event legitimately in dataset B, then update it via the happy path.
    const legitEvent = await payload.create({
      collection: "events",
      data: {
        dataset: datasetB.id,
        sourceData: { id: "legit-id", title: "Before" },
        transformedData: { id: "legit-id", title: "Before" },
        uniqueId: "legit-id",
        eventTimestamp: "2026-01-02T00:00:00.000Z",
      },
      overrideAccess: true,
    });

    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: {
        ingestFile: ingestFileB.id,
        dataset: datasetB.id,
        stage: "create-events",
        sheetIndex: 0,
        configSnapshot: { idStrategy: { duplicateStrategy: "update" } },
        duplicates: {
          internal: [],
          external: [{ rowNumber: 0, uniqueId: "legit-id", existingEventId: legitEvent.id }],
        },
      },
      overrideAccess: true,
    });

    const ctx: ProcessBatchContext = {
      payload,
      job: ingestJob,
      dataset: datasetB,
      ingestJobId: ingestJob.id,
      accessFields: { datasetIsPublic: false, catalogOwnerId: ownerB.id as number },
      logger: createLogger("cross-dataset-guard-test"),
    };

    const result = await processEventBatch(ctx, [{ id: "legit-id", title: "After" }], 0);
    expect(result.eventsUpdated).toBe(1);
    expect(result.errors).toHaveLength(0);

    const eventAfter = (await payload.findByID({ collection: "events", id: legitEvent.id, overrideAccess: true })) as {
      transformedData?: { title?: string };
    };
    expect(eventAfter.transformedData?.title).toBe("After");
  });
});
