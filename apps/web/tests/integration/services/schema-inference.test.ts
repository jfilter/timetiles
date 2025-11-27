/**
 * Integration tests for schema inference service and related functionality.
 *
 * Tests cover:
 * - Schema inference from existing events
 * - Schema freshness detection (queries event count on-demand)
 *
 * @module
 * @category Tests
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getSchemaFreshness, isSchemaStale } from "@/lib/services/schema-freshness";
import { SchemaInferenceService } from "@/lib/services/schema-inference-service";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

/** Generate a unique ID for events */
const generateUniqueId = (datasetId: number) => `${datasetId}:test:${randomUUID()}`;

describe.sequential("Schema Inference Service", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let testCatalogId: number;
  let testDatasetId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup != null) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear collections
    await testEnv.seedManager.truncate();

    // Create test users (required for proper environment setup)
    await withUsers(testEnv, ["admin"]);

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Schema Inference Test Catalog",
      description: "Catalog for schema inference tests",
    });
    testCatalogId = catalog.id;

    // Create test dataset
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: "Schema Inference Test Dataset",
      description: "Dataset for schema inference tests",
    });
    testDatasetId = dataset.id;
  });

  describe("Schema Freshness Detection", () => {
    it("detects stale schema when no schema exists but events exist", async () => {
      // Create an event first
      await payload.create({
        collection: "events",
        data: {
          dataset: testDatasetId,
          uniqueId: generateUniqueId(testDatasetId),
          data: { name: "Test Event" },
          eventTimestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      const freshness = await getSchemaFreshness(payload, testDatasetId, null);

      expect(freshness.stale).toBe(true);
      expect(freshness.reason).toBe("no_schema");
      expect(freshness.currentEventCount).toBe(1);
    });

    it("reports fresh when no schema and no events", async () => {
      const freshness = await getSchemaFreshness(payload, testDatasetId, null);

      expect(freshness.stale).toBe(false);
      expect(freshness.currentEventCount).toBe(0);
    });

    it("detects stale schema when events are added", async () => {
      // Create events
      for (let i = 0; i < 3; i++) {
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

      // Create a schema with eventCountAtCreation = 2 (less than current 3)
      const schema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 1,
          _status: "published",
          schema: { type: "object", properties: {} },
          fieldMetadata: {},
          schemaSummary: { totalFields: 0 },
          eventCountAtCreation: 2, // Less than actual count
        },
        overrideAccess: true,
      });

      const freshness = await getSchemaFreshness(payload, testDatasetId, schema);

      expect(freshness.stale).toBe(true);
      expect(freshness.reason).toBe("added");
      expect(freshness.currentEventCount).toBe(3);
      expect(freshness.schemaEventCount).toBe(2);
    });

    it("detects stale schema when events are deleted", async () => {
      // Create 3 events
      const eventIds: number[] = [];
      for (let i = 0; i < 3; i++) {
        const event = await payload.create({
          collection: "events",
          data: {
            dataset: testDatasetId,
            uniqueId: generateUniqueId(testDatasetId),
            data: { name: `Event ${i}` },
            eventTimestamp: new Date().toISOString(),
          },
          overrideAccess: true,
        });
        eventIds.push(event.id);
      }

      // Create a schema with eventCountAtCreation = 3
      const schema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 1,
          _status: "published",
          schema: { type: "object", properties: {} },
          fieldMetadata: {},
          schemaSummary: { totalFields: 0 },
          eventCountAtCreation: 3,
        },
        overrideAccess: true,
      });

      // Delete one event
      await payload.delete({
        collection: "events",
        id: eventIds[0],
        overrideAccess: true,
      });

      const freshness = await getSchemaFreshness(payload, testDatasetId, schema);

      expect(freshness.stale).toBe(true);
      expect(freshness.reason).toBe("deleted");
      expect(freshness.currentEventCount).toBe(2);
      expect(freshness.schemaEventCount).toBe(3);
    });

    it("reports fresh schema when up-to-date", async () => {
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

      // Create a schema with matching event count
      const schema = await payload.create({
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

      const freshness = await getSchemaFreshness(payload, testDatasetId, schema);

      expect(freshness.stale).toBe(false);
      expect(freshness.reason).toBeUndefined();
    });

    it("provides isSchemaStale helper function", async () => {
      // Create an event
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

      // No schema should be stale when events exist
      const stale = await isSchemaStale(payload, testDatasetId, null);
      expect(stale).toBe(true);
    });
  });

  describe("Schema Inference Service", () => {
    it("returns message when dataset has no events", async () => {
      const result = await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId);

      expect(result.generated).toBe(false);
      expect(result.message).toBe("No events in dataset to analyze");
      expect(result.eventsSampled).toBe(0);
    });

    it("generates schema from existing events", async () => {
      // Create events with varied data structures
      const testData = [
        { name: "Event 1", count: 10, active: true },
        { name: "Event 2", count: 20, active: false },
        { name: "Event 3", count: 30, active: true, optional: "value" },
      ];

      for (const data of testData) {
        await payload.create({
          collection: "events",
          data: {
            dataset: testDatasetId,
            uniqueId: generateUniqueId(testDatasetId),
            data,
            eventTimestamp: new Date().toISOString(),
          },
          overrideAccess: true,
        });
      }

      const result = await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId);

      expect(result.generated).toBe(true);
      expect(result.schema).toBeTruthy();
      expect(result.eventsSampled).toBe(3);
      expect(result.schema?.versionNumber).toBe(1);
      expect(result.schema?.eventCountAtCreation).toBe(3);

      // Verify schema was persisted
      const schemas = await payload.find({
        collection: "dataset-schemas",
        where: { dataset: { equals: testDatasetId } },
        overrideAccess: true,
      });
      expect(schemas.docs.length).toBe(1);
    });

    it("skips regeneration when schema is fresh", async () => {
      // Create events
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

      // Generate initial schema
      const firstResult = await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId);
      expect(firstResult.generated).toBe(true);

      // Try to generate again without changes
      const secondResult = await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId);
      expect(secondResult.generated).toBe(false);
      expect(secondResult.message).toBe("Schema is up-to-date");
    });

    it("regenerates schema with forceRegenerate option", async () => {
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

      // Generate initial schema
      await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId);

      // Force regeneration
      const result = await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId, {
        forceRegenerate: true,
      });

      expect(result.generated).toBe(true);
      expect(result.schema?.versionNumber).toBe(2); // Should be version 2
    });

    it("returns not found for invalid dataset ID", async () => {
      const result = await SchemaInferenceService.inferSchemaFromEvents(payload, 999999);

      expect(result.generated).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("respects sampleSize option", async () => {
      // Create 10 events
      for (let i = 0; i < 10; i++) {
        await payload.create({
          collection: "events",
          data: {
            dataset: testDatasetId,
            uniqueId: generateUniqueId(testDatasetId),
            data: { index: i },
            eventTimestamp: new Date().toISOString(),
          },
          overrideAccess: true,
        });
      }

      const result = await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId, {
        sampleSize: 5,
      });

      expect(result.generated).toBe(true);
      expect(result.eventsSampled).toBeLessThanOrEqual(5);
    });

    it("gets latest schema for dataset", async () => {
      // Create event and generate schema
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

      await SchemaInferenceService.inferSchemaFromEvents(payload, testDatasetId);

      const latestSchema = await SchemaInferenceService.getLatestSchema(payload, testDatasetId);

      expect(latestSchema).toBeTruthy();
      expect(latestSchema?.versionNumber).toBe(1);
    });

    it("returns null when no schema exists", async () => {
      const latestSchema = await SchemaInferenceService.getLatestSchema(payload, testDatasetId);

      expect(latestSchema).toBeNull();
    });
  });
});
