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

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import type { ImportJob } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
} from "../../setup/integration/environment";

describe("Import Transforms - Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;

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
  });

  describe("Schema Detection with Transforms", () => {
    it("should apply active transforms during schema detection", async () => {
      // Create catalog
      const { catalog } = await withCatalog(testEnv, {
        name: "Transform Test Catalog",
      });

      // Create dataset with import transforms
      const { dataset } = await withDataset(testEnv, catalog.id, {
        name: `Active Transforms Dataset ${Date.now()}`,
        slug: `active-transforms-${Date.now()}`,
        importTransforms: [
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

      const { importFile } = await withImportFile(testEnv, catalog.id, csvContent, {
        filename: "transform-test.csv",
      });

      // Create import job
      const importJob = await payload.create({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.DETECT_SCHEMA,
        },
      });

      // Run schema detection job
      const { schemaDetectionJob } = await import("@/lib/jobs/handlers/schema-detection-job");

      await schemaDetectionJob.handler({
        job: { id: "test-schema-detection-1", input: { importJobId: importJob.id, batchNumber: 0 } },
        req: { payload },
        payload,
        input: {
          importJobId: importJob.id,
          batchNumber: 0,
        },
      });

      // Verify the schema was detected with transformed field names
      const updatedJob = (await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJob.id,
      })) as ImportJob;

      expect(updatedJob.schema).toBeDefined();
      const schema = updatedJob.schema as any;

      expect(schema.properties).toHaveProperty("date"); // start_date → date
      expect(schema.properties).toHaveProperty("title"); // event_title → title
      expect(schema.properties).toHaveProperty("location");
      expect(schema.properties).not.toHaveProperty("start_date");
      expect(schema.properties).not.toHaveProperty("event_title");
    });

    it("should skip inactive transforms during schema detection", async () => {
      const { catalog } = await withCatalog(testEnv, {
        name: "Inactive Transform Test Catalog",
      });

      // Create dataset with inactive transform
      const { dataset } = await withDataset(testEnv, catalog.id, {
        name: `Inactive Transforms Dataset ${Date.now()}`,
        slug: `inactive-transforms-${Date.now()}`,
        importTransforms: [
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

      const { importFile } = await withImportFile(testEnv, catalog.id, csvContent, {
        filename: "inactive-transform.csv",
      });

      const importJob = await payload.create({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.DETECT_SCHEMA,
        },
      });

      const { schemaDetectionJob } = await import("@/lib/jobs/handlers/schema-detection-job");

      await schemaDetectionJob.handler({
        job: { id: "test-schema-detection-2", input: { importJobId: importJob.id, batchNumber: 0 } },
        req: { payload },
        payload,
        input: {
          importJobId: importJob.id,
          batchNumber: 0,
        },
      });

      const updatedJob = (await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJob.id,
      })) as ImportJob;

      expect(updatedJob.schema).toBeDefined();
      const schema = updatedJob.schema as any;
      expect(schema.properties).toHaveProperty("old_name"); // Original name preserved
      expect(schema.properties).not.toHaveProperty("new_name");
    });
  });

  describe("Transform Detection during Validation", () => {
    it("should detect and suggest transforms for renamed fields", async () => {
      const { catalog } = await withCatalog(testEnv, {
        name: "Transform Detection Catalog",
      });

      // Create dataset without transforms (for first import)
      const { dataset } = await withDataset(testEnv, catalog.id, {
        name: `Transform Detection Dataset ${Date.now()}`,
        slug: `transform-detection-${Date.now()}`,
      });

      // Create first import to establish baseline schema
      const initialCsv = `date,title,location
2024-01-01,Event 1,City A
2024-02-01,Event 2,City B`;

      const { importFile: importFile1 } = await withImportFile(testEnv, catalog.id, initialCsv, {
        filename: "initial.csv",
      });

      const importJob1 = await payload.create({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        data: {
          importFile: importFile1.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.DETECT_SCHEMA,
        },
      });

      // Run first import to establish baseline schema
      const { schemaDetectionJob } = await import("@/lib/jobs/handlers/schema-detection-job");
      await schemaDetectionJob.handler({
        job: { id: "test-detection-1", input: { importJobId: importJob1.id, batchNumber: 0 } },
        req: { payload },
        payload,
        input: { importJobId: importJob1.id, batchNumber: 0 },
      });

      const completedJob1 = (await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJob1.id,
      })) as ImportJob;

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

      const { importFile: importFile2 } = await withImportFile(testEnv, catalog.id, renamedCsv, {
        filename: "renamed.csv",
      });

      const importJob2 = await payload.create({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        data: {
          importFile: importFile2.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.DETECT_SCHEMA,
        },
      });

      // Run schema detection for second import
      await schemaDetectionJob.handler({
        job: { id: "test-detection-2", input: { importJobId: importJob2.id, batchNumber: 0 } },
        req: { payload },
        payload,
        input: { importJobId: importJob2.id, batchNumber: 0 },
      });

      // Run schema validation to detect transforms
      const { validateSchemaJob } = await import("@/lib/jobs/handlers/validate-schema-job");
      await validateSchemaJob.handler({
        job: { id: "test-validation-1", input: { importJobId: importJob2.id } },
        req: { payload },
        payload,
        input: { importJobId: importJob2.id },
      });

      // Verify transform suggestions were detected
      const validatedJob = (await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJob2.id,
      })) as ImportJob;

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
