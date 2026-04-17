/**
 * Integration tests for import transforms functionality.
 *
 * Tests the complete workflow of applying import transforms during:
 * - Schema detection
 * - Transform suggestion during validation
 * - Event creation
 *
 * @module
 * @category Integration Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { IngestJob } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Import Transforms - Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testUser: any;

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
    // Fresh user per test avoids stale user-usage state from other
    // integration tests sharing the same worker database
    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    testUser = users.testUser;
  });

  describe("Schema Detection with Transforms", () => {
    it("should apply active transforms during schema detection", async () => {
      // Create catalog
      const { catalog } = await withCatalog(testEnv, { name: "Transform Test Catalog", user: testUser });

      // Create dataset with import transforms
      const { dataset } = await withDataset(testEnv, catalog.id, {
        name: `Active Transforms Dataset ${Date.now()}`,
        slug: `active-transforms-${Date.now()}`,
        ingestTransforms: [
          {
            id: crypto.randomUUID(),
            type: "rename",
            from: "start_date",
            to: "date",
            active: true,
            autoDetected: false,
          },
          {
            id: crypto.randomUUID(),
            type: "rename",
            from: "event_title",
            to: "title",
            active: true,
            autoDetected: false,
          },
        ],
      });

      // Create a CSV file with columns that need transformation
      const csvContent = `start_date,event_title,location
2024-01-01,Conference,San Francisco
2024-02-15,Workshop,New York`;

      const { ingestFile } = await withIngestFile(testEnv, catalog.id, csvContent, {
        filename: "transform-test.csv",
        user: testUser.id,
      });

      // Create import job
      const ingestJob = await payload.create({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.DETECT_SCHEMA },
      });

      // Run schema detection job
      const { schemaDetectionJob } = await import("@/lib/jobs/handlers/schema-detection-job");

      await schemaDetectionJob.handler({
        job: { id: "test-schema-detection-1", input: { ingestJobId: ingestJob.id } },
        req: { payload },
        input: { ingestJobId: ingestJob.id },
      });

      // Verify the schema was detected with transformed field names
      const updatedJob = (await payload.findByID({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJob.id,
      })) as IngestJob;

      expect(updatedJob.schema).toBeDefined();
      const schema = updatedJob.schema as any;

      expect(schema.properties).toHaveProperty("date"); // start_date → date
      expect(schema.properties).toHaveProperty("title"); // event_title → title
      expect(schema.properties).toHaveProperty("location");
      expect(schema.properties).not.toHaveProperty("start_date");
      expect(schema.properties).not.toHaveProperty("event_title");
    });

    it("should skip inactive transforms during schema detection", async () => {
      const { catalog } = await withCatalog(testEnv, { name: "Inactive Transform Test Catalog", user: testUser });

      // Create dataset with inactive transform
      const { dataset } = await withDataset(testEnv, catalog.id, {
        name: `Inactive Transforms Dataset ${Date.now()}`,
        slug: `inactive-transforms-${Date.now()}`,
        ingestTransforms: [
          {
            id: crypto.randomUUID(),
            type: "rename",
            from: "old_name",
            to: "new_name",
            active: false, // Inactive
            autoDetected: false,
          },
        ],
      });

      const csvContent = `old_name,value
Item 1,100
Item 2,200`;

      const { ingestFile } = await withIngestFile(testEnv, catalog.id, csvContent, {
        filename: "inactive-transform.csv",
        user: testUser.id,
      });

      const ingestJob = await payload.create({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.DETECT_SCHEMA },
      });

      const { schemaDetectionJob } = await import("@/lib/jobs/handlers/schema-detection-job");

      await schemaDetectionJob.handler({
        job: { id: "test-schema-detection-2", input: { ingestJobId: ingestJob.id } },
        req: { payload },
        input: { ingestJobId: ingestJob.id },
      });

      const updatedJob = (await payload.findByID({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJob.id,
      })) as IngestJob;

      expect(updatedJob.schema).toBeDefined();
      const schema = updatedJob.schema as any;
      expect(schema.properties).toHaveProperty("old_name"); // Original name preserved
      expect(schema.properties).not.toHaveProperty("new_name");
    });
  });

  describe("Transform Detection during Validation", () => {
    it("should detect and suggest transforms for renamed fields", async () => {
      const { catalog } = await withCatalog(testEnv, { name: "Transform Detection Catalog", user: testUser });

      // Create dataset without transforms (for first import)
      const { dataset } = await withDataset(testEnv, catalog.id, {
        name: `Transform Detection Dataset ${Date.now()}`,
        slug: `transform-detection-${Date.now()}`,
      });

      // Create first import to establish baseline schema
      const initialCsv = `date,title,location
2024-01-01,Event 1,City A
2024-02-01,Event 2,City B`;

      const { ingestFile: importFile1 } = await withIngestFile(testEnv, catalog.id, initialCsv, {
        filename: "initial.csv",
        user: testUser.id,
      });

      const importJob1 = await payload.create({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        data: { ingestFile: importFile1.id, dataset: dataset.id, stage: PROCESSING_STAGE.DETECT_SCHEMA },
      });

      // Run first import to establish baseline schema
      const { schemaDetectionJob } = await import("@/lib/jobs/handlers/schema-detection-job");
      await schemaDetectionJob.handler({
        job: { id: "test-detection-1", input: { ingestJobId: importJob1.id } },
        req: { payload },
        input: { ingestJobId: importJob1.id },
      });

      const completedJob1 = (await payload.findByID({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: importJob1.id,
      })) as IngestJob;

      // Create dataset schema version from first import
      await payload.create({
        collection: COLLECTION_NAMES.DATASET_SCHEMAS,
        data: {
          dataset: dataset.id,
          versionNumber: 1,
          schema: completedJob1.schema,
          fieldMetadata: {},
          isActive: true,
        },
      });

      // Now create second import with renamed fields
      const renamedCsv = `start_date,event_title,location
2024-03-01,Event 3,City C`;

      const { ingestFile: importFile2 } = await withIngestFile(testEnv, catalog.id, renamedCsv, {
        filename: "renamed.csv",
        user: testUser.id,
      });

      const importJob2 = await payload.create({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        data: { ingestFile: importFile2.id, dataset: dataset.id, stage: PROCESSING_STAGE.DETECT_SCHEMA },
      });

      // Run schema detection for second import
      await schemaDetectionJob.handler({
        job: { id: "test-detection-2", input: { ingestJobId: importJob2.id } },
        req: { payload },
        input: { ingestJobId: importJob2.id },
      });

      // Run schema validation to detect transforms
      const { validateSchemaJob } = await import("@/lib/jobs/handlers/validate-schema-job");
      await validateSchemaJob.handler({
        job: { id: "test-validation-1", input: { ingestJobId: importJob2.id } },
        req: { payload },
        input: { ingestJobId: importJob2.id },
      });

      // Verify transform suggestions were detected
      const validatedJob = (await payload.findByID({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: importJob2.id,
      })) as IngestJob;

      expect(validatedJob.schemaValidation?.transformSuggestions).toBeDefined();
      const suggestions = validatedJob.schemaValidation!.transformSuggestions as any[];

      // Should suggest date → start_date and title → event_title
      expect(suggestions.length).toBeGreaterThan(0);

      const dateSuggestion = suggestions.find((s) => s.to === "date");
      expect(dateSuggestion).toBeDefined();
      expect(dateSuggestion!.from).toBe("start_date");
      expect(dateSuggestion!.confidence).toBeGreaterThanOrEqual(70);

      const titleSuggestion = suggestions.find((s) => s.to === "title");
      expect(titleSuggestion).toBeDefined();
      expect(titleSuggestion!.from).toBe("event_title");
    });
  });
});
