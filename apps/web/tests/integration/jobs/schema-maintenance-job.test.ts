/**
 * Integration tests for the schema maintenance job.
 *
 * @module
 * @category Tests
 */
import { randomUUID } from "node:crypto";

import { sql } from "@payloadcms/db-postgres";
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
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["users", "catalogs", "datasets", "events", "dataset-schemas"]);
    const { users } = await withUsers(testEnv, ["admin"]);

    const { catalog } = await withCatalog(testEnv, {
      name: "Schema Maintenance Test Catalog",
      description: "Catalog for schema maintenance tests",
      user: users.admin,
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
          sourceData: { name: `Event ${i}`, value: i },
          transformedData: { name: `Event ${i}`, value: i },
          eventTimestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });
    }

    // Run the job
    const result = await schemaMaintenanceJob.handler({ req: { payload }, input: { datasetIds: [testDatasetId] } });

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
    expect(schemas.docs).toHaveLength(1);
  });

  it("skips dataset with fresh schema", async () => {
    // Create event
    await payload.create({
      collection: "events",
      data: {
        dataset: testDatasetId,
        uniqueId: generateUniqueId(testDatasetId),
        sourceData: { name: "Test" },
        transformedData: { name: "Test" },
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
    const result = await schemaMaintenanceJob.handler({ req: { payload }, input: { datasetIds: [testDatasetId] } });

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
          sourceData: { name: `Event ${i}` },
          transformedData: { name: `Event ${i}` },
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
    const result = await schemaMaintenanceJob.handler({ req: { payload }, input: { datasetIds: [testDatasetId] } });

    expect(result.output.success).toBe(true);
    expect(result.output.schemasGenerated).toBe(1);

    // Verify new schema version created
    const schemas = await payload.find({
      collection: "dataset-schemas",
      where: { dataset: { equals: testDatasetId } },
      sort: "-versionNumber",
      overrideAccess: true,
    });
    expect(schemas.docs).toHaveLength(2);
    expect(schemas.docs[0]!.versionNumber).toBe(2);
  });

  it("skips dataset with no events", async () => {
    // Dataset exists but has no events - considered "up-to-date" (no schema needed)
    const result = await schemaMaintenanceJob.handler({ req: { payload }, input: { datasetIds: [testDatasetId] } });

    expect(result.output.success).toBe(true);
    expect(result.output.schemasGenerated).toBe(0);
    expect(result.output.schemasSkipped).toBe(1);
    // No events + no schema = fresh (no schema needed)
    expect(result.output.details?.[0]?.reason).toBe("Schema is up-to-date");
  });

  it.each([false, true])(
    "retries partial failures without repeating successful work (legacy force: %s)",
    async (forceRegenerate) => {
      const { dataset: failingDataset } = await withDataset(testEnv, testCatalogId, {
        name: "Temporarily failing dataset",
      });
      const datasetIds = [testDatasetId, failingDataset.id];
      for (const datasetId of datasetIds) {
        await payload.create({
          collection: "events",
          data: {
            dataset: datasetId,
            uniqueId: generateUniqueId(datasetId),
            sourceData: { name: "Event" },
            transformedData: { name: "Event" },
            eventTimestamp: new Date().toISOString(),
          },
          overrideAccess: true,
        });
      }

      // Include the obsolete flag to cover already queued jobs as well as normal runs.
      const job = await payload.jobs.queue({
        task: "schema-maintenance",
        queue: "maintenance",
        input: { datasetIds, forceRegenerate },
      });
      // Real write failure in this disposable worker database; always remove the constraint.
      await payload.db.drizzle.execute(sql`ALTER TABLE payload.dataset_schemas
      ADD CONSTRAINT reject_schema_maintenance_test
      CHECK (dataset_id <> ${sql.raw(String(failingDataset.id))}) NOT VALID`);
      try {
        await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });
        const successfulSchemas = await payload.count({
          collection: "dataset-schemas",
          where: { dataset: { equals: testDatasetId } },
        });
        expect(successfulSchemas.totalDocs).toBe(1);
        const retryingJob = await payload.findByID({ collection: "payload-jobs", id: job.id });
        expect(retryingJob.totalTried).toBe(1);
        expect(retryingJob.hasError).toBe(false);
        expect(retryingJob.completedAt).toBeFalsy();
      } finally {
        await payload.db.drizzle.execute(sql`ALTER TABLE payload.dataset_schemas
        DROP CONSTRAINT reject_schema_maintenance_test`);
      }

      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });
      const schemas = await payload.find({
        collection: "dataset-schemas",
        where: { dataset: { in: datasetIds } },
        sort: "dataset",
      });
      expect(schemas.docs.map((schema) => schema.versionNumber)).toEqual([1, 1]);
      expect((await payload.count({ collection: "payload-jobs", where: { id: { equals: job.id } } })).totalDocs).toBe(
        0
      );
    }
  );

  /**
   * The scan used to stop at `maxDatasets` datasets ordered by id, with no cursor and no
   * rotating order, so anything past that window kept a stale schema forever. The cap now
   * bounds the regenerations, not the scan.
   */
  it("reaches datasets beyond the per-run regeneration limit", async () => {
    const datasetIds = [testDatasetId];
    for (let i = 0; i < 2; i++) {
      const { dataset } = await withDataset(testEnv, testCatalogId, {
        name: `Overflow Dataset ${i}`,
        description: "Dataset past the per-run limit",
      });
      datasetIds.push(dataset.id);
    }

    for (const datasetId of datasetIds) {
      await payload.create({
        collection: "events",
        data: {
          dataset: datasetId,
          uniqueId: generateUniqueId(datasetId),
          sourceData: { name: "Event" },
          transformedData: { name: "Event" },
          eventTimestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });
    }

    const lastDatasetId = datasetIds[datasetIds.length - 1]!;

    // One regeneration per run; three runs must reach all three datasets, including the
    // last one, which the truncated scan could never have seen.
    for (let run = 0; run < datasetIds.length; run++) {
      const result = await schemaMaintenanceJob.handler({ req: { payload }, input: { maxDatasets: 1 } });
      expect(result.output.datasetsChecked).toBe(datasetIds.length);
      expect(result.output.schemasGenerated).toBe(1);
    }

    const schemas = await payload.find({
      collection: "dataset-schemas",
      where: { dataset: { equals: lastDatasetId } },
      overrideAccess: true,
    });
    expect(schemas.docs).toHaveLength(1);
  });
});
