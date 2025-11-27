/**
 * Integration tests for the schema maintenance job.
 *
 * @module
 * @category Tests
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { schemaMaintenanceJob } from "@/lib/jobs/handlers/schema-maintenance-job";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

const generateUniqueId = (datasetId: number) => `${datasetId}:test:${randomUUID()}`;

describe.sequential("Schema Maintenance Job", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let testCatalogId: number;
  let testDatasetId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate();
    await withUsers(testEnv, ["admin"]);

    const { catalog } = await withCatalog(testEnv, {
      name: "Schema Maintenance Test Catalog",
      description: "Catalog for schema maintenance tests",
    });
    testCatalogId = catalog.id;

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: "Schema Maintenance Test Dataset",
      description: "Dataset for schema maintenance tests",
    });
    testDatasetId = dataset.id;
  });

  it("generates schema for dataset with events but no schema", async () => {
    // Create events without schema
    for (let i = 0; i < 3; i++) {
      await payload.create({
        collection: "events",
        data: {
          dataset: testDatasetId,
          uniqueId: generateUniqueId(testDatasetId),
          data: { name: `Event ${i}`, value: i },
          eventTimestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });
    }

    // Run the job
    const result = await schemaMaintenanceJob.handler({
      payload,
      input: { datasetIds: [testDatasetId] },
    } as Parameters<typeof schemaMaintenanceJob.handler>[0]);

    expect(result.output.success).toBe(true);
    expect(result.output.datasetsChecked).toBe(1);
    expect(result.output.schemasGenerated).toBe(1);
    expect(result.output.schemasSkipped).toBe(0);

    // Verify schema was created
    const schemas = await payload.find({
      collection: "dataset-schemas",
      where: { dataset: { equals: testDatasetId } },
      overrideAccess: true,
    });
    expect(schemas.docs.length).toBe(1);
  });

  it("skips dataset with fresh schema", async () => {
    // Create event
    await payload.create({
      collection: "events",
      data: {
        dataset: testDatasetId,
        uniqueId: generateUniqueId(testDatasetId),
        data: { name: "Test" },
        eventTimestamp: new Date().toISOString(),
      },
      overrideAccess: true,
    });

    // Create matching schema
    await payload.create({
      collection: "dataset-schemas",
      data: {
        dataset: testDatasetId,
        versionNumber: 1,
        _status: "published",
        schema: { type: "object", properties: {} },
        fieldMetadata: {},
        schemaSummary: { totalFields: 0 },
        eventCountAtCreation: 1,
      },
      overrideAccess: true,
    });

    // Run the job
    const result = await schemaMaintenanceJob.handler({
      payload,
      input: { datasetIds: [testDatasetId] },
    } as Parameters<typeof schemaMaintenanceJob.handler>[0]);

    expect(result.output.success).toBe(true);
    expect(result.output.schemasGenerated).toBe(0);
    expect(result.output.schemasSkipped).toBe(1);
  });

  it("regenerates stale schema when events added", async () => {
    // Create initial events and schema
    for (let i = 0; i < 2; i++) {
      await payload.create({
        collection: "events",
        data: {
          dataset: testDatasetId,
          uniqueId: generateUniqueId(testDatasetId),
          data: { name: `Event ${i}` },
          eventTimestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });
    }

    await payload.create({
      collection: "dataset-schemas",
      data: {
        dataset: testDatasetId,
        versionNumber: 1,
        _status: "published",
        schema: { type: "object", properties: {} },
        fieldMetadata: {},
        schemaSummary: { totalFields: 0 },
        eventCountAtCreation: 1, // Stale - only counted 1 event
      },
      overrideAccess: true,
    });

    // Run the job
    const result = await schemaMaintenanceJob.handler({
      payload,
      input: { datasetIds: [testDatasetId] },
    } as Parameters<typeof schemaMaintenanceJob.handler>[0]);

    expect(result.output.success).toBe(true);
    expect(result.output.schemasGenerated).toBe(1);

    // Verify new schema version created
    const schemas = await payload.find({
      collection: "dataset-schemas",
      where: { dataset: { equals: testDatasetId } },
      sort: "-versionNumber",
      overrideAccess: true,
    });
    expect(schemas.docs.length).toBe(2);
    expect(schemas.docs[0].versionNumber).toBe(2);
  });

  it("skips dataset with no events", async () => {
    // Dataset exists but has no events - considered "up-to-date" (no schema needed)
    const result = await schemaMaintenanceJob.handler({
      payload,
      input: { datasetIds: [testDatasetId] },
    } as Parameters<typeof schemaMaintenanceJob.handler>[0]);

    expect(result.output.success).toBe(true);
    expect(result.output.schemasGenerated).toBe(0);
    expect(result.output.schemasSkipped).toBe(1);
    // No events + no schema = fresh (no schema needed)
    expect(result.output.details?.[0]?.reason).toBe("Schema is up-to-date");
  });
});
