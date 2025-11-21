/**
 * Integration tests for type transformation feature in import pipeline.
 *
 * Tests the transformation workflow by directly calling the job handler
 * with mock data, bypassing CSV file parsing to avoid Papa Parse's
 * automatic type conversion (dynamicTyping: true).
 *
 * @module
 * @category Integration Tests
 */
import type { Payload } from "payload";
import { vi } from "vitest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import * as fileReaders from "@/lib/utils/file-readers";
import type { Catalog, Dataset, Event } from "@/payload-types";

import { createIntegrationTestEnvironment, withCatalog, withImportFile } from "../../setup/integration/environment";

// Helper to safely access event data fields
const getEventData = (event: Event): Record<string, unknown> => {
  return typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : {};
};

describe.sequential("Type Transformations Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testCatalog: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { catalog } = await withCatalog(testEnv, {
      name: "Transformation Test Catalog",
    });
    testCatalog = catalog;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["events", "import-jobs", "import-files", "datasets"]);
    vi.restoreAllMocks();
  });

  it("should transform string numbers to actual numbers", async () => {
    // Mock readBatchFromFile to return data with STRING values (not auto-converted)
    const mockData = [
      { id: "1", name: "Alice", age: "25", temperature: "72.5" },
      { id: "2", name: "Bob", age: "30", temperature: "68.3" },
    ];

    vi.spyOn(fileReaders, "readBatchFromFile").mockReturnValue(mockData);

    const dataset: Dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Transform Test Dataset",
        catalog: testCatalog.id,
        language: "eng",
        schemaConfig: {
          allowTransformations: true,
        },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
          },
          {
            fieldPath: "temperature",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
          },
        ],
        idStrategy: {
          type: "external",
          externalIdPath: "id",
        },
      },
    });

    const { importFile } = await withImportFile(testEnv, testCatalog.id, Buffer.from("mock,data\n1,2"), {
      filename: "test-transform.csv",
    });

    const importJob = await payload.create({
      collection: "import-jobs",
      data: {
        dataset: dataset.id,
        importFile: importFile.id,
        stage: "create-events",
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
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
      input: { importJobId: importJob.id, batchNumber: 0 },
    });

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
      limit: 10,
    });

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
    const mockData = [{ id: "1", name: "Alice", age: "25" }];
    vi.spyOn(fileReaders, "readBatchFromFile").mockReturnValue(mockData);

    const dataset: Dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "No Transform Dataset",
        catalog: testCatalog.id,
        language: "eng",
        schemaConfig: {
          allowTransformations: false,
        },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
          },
        ],
        idStrategy: {
          type: "external",
          externalIdPath: "id",
        },
      },
    });

    const { importFile } = await withImportFile(testEnv, testCatalog.id, Buffer.from("mock,data\n1,2"), {
      filename: "test-no-transform.csv",
    });

    const importJob = await payload.create({
      collection: "import-jobs",
      data: {
        dataset: dataset.id,
        importFile: importFile.id,
        stage: "create-events",
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
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
      input: { importJobId: importJob.id, batchNumber: 0 },
    });

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
    });

    expect(events.docs).toHaveLength(1);
    const event = events.docs[0]!;
    const eventData = getEventData(event);
    expect(eventData.age).toBe("25"); // Still a string
    expect(event.validationStatus).toBe("pending");
    expect(event.transformations).toBeNull();
  });
});
