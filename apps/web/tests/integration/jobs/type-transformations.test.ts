/**
 * Integration tests for expression transform feature in import pipeline.
 *
 * Tests the transformation workflow by directly calling the job handler
 * with mock data, bypassing CSV file parsing to avoid Papa Parse's
 * automatic type conversion (dynamicTyping: true).
 *
 * @module
 * @category Integration Tests
 */
import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as fileReaders from "@/lib/ingest/file-readers";
import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { Catalog, Dataset, Event } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

// Helper to safely access event data fields
const getEventData = (event: Event): Record<string, unknown> => {
  return typeof event.transformedData === "object" &&
    event.transformedData !== null &&
    !Array.isArray(event.transformedData)
    ? event.transformedData
    : {};
};

/** Create a mock async iterable that yields a single batch of rows. */
const mockStreamBatch = (rows: Record<string, unknown>[]) => ({
  [Symbol.asyncIterator]: () => {
    let yielded = false;
    return {
      next: async () => {
        await Promise.resolve();
        if (!yielded) {
          yielded = true;
          return { value: rows, done: false as const };
        }
        return { value: undefined, done: true as const };
      },
    };
  },
});

describe.sequential("Expression Transforms Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testCatalog: Catalog;
  let testUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    testUserId = users.testUser.id;

    const { catalog } = await withCatalog(testEnv, { name: "Transformation Test Catalog", user: users.testUser });
    testCatalog = catalog;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["events", "ingest-jobs", "ingest-files", "datasets", "dataset-schemas"]);
    vi.restoreAllMocks();
  });

  it("should transform string numbers to actual numbers", async () => {
    // Mock readBatchFromFile to return data with STRING values (not auto-converted)
    const mockData = [
      { id: "1", name: "Alice", age: "25", temperature: "72.5" },
      { id: "2", name: "Bob", age: "30", temperature: "68.3" },
    ];

    vi.spyOn(fileReaders, "streamBatchesFromFile").mockReturnValue(mockStreamBatch(mockData) as any);

    const dataset: Dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Transform Test Dataset",
        catalog: testCatalog.id,
        language: "eng",
        ingestTransforms: [
          {
            id: "transform-age",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "toNumber(value)",
            active: true,
          },
          {
            id: "transform-temperature",
            type: "string-op",
            from: "temperature",
            operation: "expression",
            expression: "toNumber(value)",
            active: true,
          },
        ] as any,

        idStrategy: { type: "external", externalIdPath: "id" },
      },
    });

    const { ingestFile } = await withIngestFile(testEnv, testCatalog.id, Buffer.from("mock,data\n1,2"), {
      filename: "test-transform.csv",
      user: testUserId,
    });

    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: {
        dataset: dataset.id,
        ingestFile: ingestFile.id,
        stage: "create-events",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: {
          internal: [],
          external: [],
          summary: { totalRows: 2, uniqueRows: 2, internalDuplicates: 0, externalDuplicates: 0 },
        },
      },
    });

    await createEventsBatchJob.handler({
      job: { id: "test-job-1" },
      req: { payload },
      input: { ingestJobId: ingestJob.id },
    });

    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } }, limit: 10 });

    expect(events.docs).toHaveLength(2);

    const alice = events.docs.find((e) => getEventData(e).name === "Alice");
    expect(alice).toBeDefined();
    const aliceData = getEventData(alice!);
    expect(aliceData.age).toBe(25); // Transformed to number
    expect(aliceData.temperature).toBe(72.5);
    expect(alice!.validationStatus).toBe("transformed");
    expect(alice!.transformations).toHaveLength(2);
  });

  it("should not transform when allowTransformations is false", async () => {
    // Use unique IDs (100+) that don't collide with the first test's IDs (1, 2)
    // to avoid uniqueId constraint violations when truncation doesn't clear bulk-inserted events
    const mockData = [{ id: "100", name: "Alice", age: "25" }];
    vi.spyOn(fileReaders, "streamBatchesFromFile").mockReturnValue(mockStreamBatch(mockData) as any);

    const dataset: Dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "No Transform Dataset",
        catalog: testCatalog.id,
        language: "eng",
        ingestTransforms: [
          {
            id: "transform-age-disabled",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "toNumber(value)",
            active: false,
          },
        ] as any,

        idStrategy: { type: "external", externalIdPath: "id" },
      },
    });

    const { ingestFile } = await withIngestFile(testEnv, testCatalog.id, Buffer.from("mock,data\n1,2"), {
      filename: "test-no-transform.csv",
      user: testUserId,
    });

    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: {
        dataset: dataset.id,
        ingestFile: ingestFile.id,
        stage: "create-events",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: {
          internal: [],
          external: [],
          summary: { totalRows: 1, uniqueRows: 1, internalDuplicates: 0, externalDuplicates: 0 },
        },
      },
    });

    await createEventsBatchJob.handler({
      job: { id: "test-job-2" },
      req: { payload },
      input: { ingestJobId: ingestJob.id },
    });

    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } } });

    expect(events.docs).toHaveLength(1);
    const event = events.docs[0]!;
    const eventData = getEventData(event);
    expect(eventData.age).toBe("25"); // Still a string
    expect(event.validationStatus).toBe("pending");
    expect(event.transformations).toBeNull();
  });
});
