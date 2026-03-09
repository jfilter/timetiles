/**
 * Integration tests for multi-language field mapping detection and import.
 *
 * This test suite covers:
 * - Automatic field mapping detection for different languages (German, French, Spanish)
 * - Event creation with language-specific field names
 * - Fallback to English patterns when primary language doesn't match
 * - End-to-end import workflow with field mappings.
 *
 * Tests verify that the system can correctly detect and map field names across
 * multiple languages, extract the appropriate data, and create events with proper
 * field mapping.
 *
 * @module
 * @category Integration Tests
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { logger } from "@/lib/logger";

import {
  createIntegrationTestEnvironment,
  runJobsUntilImportJobStage,
  runJobsUntilImportSettled,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Multi-Language Import Tests", () => {
  const collectionsToReset = [
    "events",
    "import-files",
    "import-jobs",
    "datasets",
    "dataset-schemas",
    "catalogs",
    "users",
    "user-usage",
    "payload-jobs",
  ];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let importerUserId: string | number;
  let approverUser: any;
  let fixtureCache: Map<string, Buffer>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
    fixtureCache = new Map();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear collections before each test
    await testEnv.seedManager.truncate(collectionsToReset);

    const { users } = await withUsers(testEnv, {
      importer: { role: "user" },
      approver: { role: "admin" },
    });
    importerUserId = users.importer.id;
    approverUser = users.approver;

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Multi-Language Test Catalog",
      description: "Catalog for testing multi-language field detection",
    });
    testCatalogId = catalog.id;
  });

  // Helper functions

  const runJobsUntilComplete = async (importFileId: string, maxIterations = 50) => {
    const result = await runJobsUntilImportSettled(payload, importFileId, {
      maxIterations,
      onPending: ({ iteration, importFile }) => {
        if (iteration % 10 === 0) {
          logger.debug(`Iteration ${iteration}: File status=${importFile.status}`);
        }
      },
    });

    return result.settled;
  };

  const simulateSchemaApproval = async (importJobId: string) => {
    const beforeJob = await payload.findByID({
      collection: "import-jobs",
      id: importJobId,
    });

    const updatedSchemaValidation = {
      ...beforeJob.schemaValidation,
      approved: true,
      approvedBy: approverUser.id,
      approvedAt: new Date().toISOString(),
    };

    await payload.update({
      collection: "import-jobs",
      id: importJobId,
      data: {
        schemaValidation: updatedSchemaValidation,
      },
      user: approverUser, // Pass user context for authentication
    });
  };

  const importLanguageCSV = async (fixtureName: string, language: string) => {
    const fixturePath = path.join(__dirname, "../../fixtures", fixtureName);
    const fileBuffer = fixtureCache.get(fixtureName) ?? fs.readFileSync(fixturePath);
    fixtureCache.set(fixtureName, fileBuffer);

    // Create dataset with language setting - name must match the CSV filename for dataset-detection to find it
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: fixtureName, // Must match importFile.originalName for dataset-detection to reuse it
      language,
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      },
    });

    // Upload CSV file - dataset-detection will find our pre-created dataset by name
    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
      filename: fixtureName,
      mimeType: "text/csv",
      user: importerUserId,
      datasetsCount: 0,
      datasetsProcessed: 0,
    });

    const schemaDetectionResult = await runJobsUntilImportJobStage(
      payload,
      importFile.id,
      (importJob) =>
        importJob.stage === "validate-schema" ||
        importJob.stage === "processing" ||
        importJob.stage === "completed",
      {
        maxIterations: 20,
        onPending: ({ iteration, importJob }) => {
          if (iteration % 5 !== 0) {
            return;
          }

          logger.debug("Waiting for language import schema detection", {
            fixtureName,
            iteration,
            stage: importJob?.stage ?? "missing",
          });
        },
      }
    );
    expect(schemaDetectionResult.matched).toBe(true);

    // Get the final import job with related data
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
      sort: "createdAt",
      depth: 2,
    });

    expect(importJobs.docs.length).toBeGreaterThan(0);
    const importJob = importJobs.docs[0];

    return { importFile, importJob, dataset };
  };

  describe("German Language Detection", () => {
    it("should detect German field mappings (titel, beschreibung, datum)", async () => {
      const { importJob } = await importLanguageCSV("events-german.csv", "deu");

      // Check that field mappings were detected
      expect(importJob.detectedFieldMappings).toBeDefined();
      expect(importJob.detectedFieldMappings.titlePath).toBe("titel");
      expect(importJob.detectedFieldMappings.descriptionPath).toBe("beschreibung");
      expect(importJob.detectedFieldMappings.timestampPath).toBe("datum");
    });

    it("should create events with German field names", async () => {
      const { importFile, importJob } = await importLanguageCSV("events-german.csv", "deu");

      // Approve schema
      await simulateSchemaApproval(importJob.id);

      // Complete the import
      const completed = await runJobsUntilComplete(importFile.id);
      expect(completed).toBe(true);

      // Check that events were created (for this specific dataset)
      const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
      const events = await payload.find({
        collection: "events",
        where: {
          dataset: { equals: datasetId },
        },
        sort: "eventTimestamp", // Sort by timestamp for consistent order
      });

      expect(events.docs.length).toBe(3);

      // Verify first event (earliest timestamp) has correct data
      const firstEvent = events.docs[0];
      expect(firstEvent.data).toBeDefined();
      expect(firstEvent.data.titel).toBeDefined();
      expect(firstEvent.data.beschreibung).toBeDefined();
      expect(firstEvent.eventTimestamp).toBeDefined();
    });
  });

  describe("French Language Detection", () => {
    it("should detect French field mappings (titre, description, date)", async () => {
      const { importJob } = await importLanguageCSV("events-french.csv", "fra");

      expect(importJob.detectedFieldMappings).toBeDefined();
      expect(importJob.detectedFieldMappings.titlePath).toBe("titre");
      expect(importJob.detectedFieldMappings.descriptionPath).toBe("description");
      expect(importJob.detectedFieldMappings.timestampPath).toBe("date");
    });

    it("should create events with French field names", async () => {
      const { importFile, importJob } = await importLanguageCSV("events-french.csv", "fra");

      await simulateSchemaApproval(importJob.id);
      const completed = await runJobsUntilComplete(importFile.id);
      expect(completed).toBe(true);

      const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
      const events = await payload.find({
        collection: "events",
        where: {
          dataset: { equals: datasetId },
        },
        sort: "eventTimestamp", // Sort by timestamp for consistent order
      });

      expect(events.docs.length).toBe(3);

      // Verify first event (earliest timestamp) has correct data
      const firstEvent = events.docs[0];
      expect(firstEvent.data).toBeDefined();
      expect(firstEvent.data.titre).toBeDefined();
      expect(firstEvent.data.description).toBeDefined();
      expect(firstEvent.eventTimestamp).toBeDefined();
    });
  });

  describe("Spanish Language Detection", () => {
    it("should detect Spanish field mappings (título, descripción, fecha)", async () => {
      const { importJob } = await importLanguageCSV("events-spanish.csv", "spa");

      expect(importJob.detectedFieldMappings).toBeDefined();
      expect(importJob.detectedFieldMappings.titlePath).toBe("título");
      expect(importJob.detectedFieldMappings.descriptionPath).toBe("descripción");
      expect(importJob.detectedFieldMappings.timestampPath).toBe("fecha");
    });

    it("should create events with Spanish field names", async () => {
      const { importFile, importJob } = await importLanguageCSV("events-spanish.csv", "spa");

      await simulateSchemaApproval(importJob.id);
      const completed = await runJobsUntilComplete(importFile.id);
      expect(completed).toBe(true);

      const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
      const events = await payload.find({
        collection: "events",
        where: {
          dataset: { equals: datasetId },
        },
        sort: "eventTimestamp", // Sort by timestamp for consistent order
      });

      expect(events.docs.length).toBe(3);

      // Verify first event (earliest timestamp) has correct data
      const firstEvent = events.docs[0];
      expect(firstEvent.data).toBeDefined();
      expect(firstEvent.data.título).toBeDefined();
      expect(firstEvent.data.descripción).toBeDefined();
      expect(firstEvent.eventTimestamp).toBeDefined();
    });
  });

  describe("Language Fallback", () => {
    it("should fallback to English patterns when German dataset uses English field names", async () => {
      const { importJob } = await importLanguageCSV("events-mixed-english-german.csv", "deu");

      // Should detect English field names even though language is German
      expect(importJob.detectedFieldMappings).toBeDefined();
      expect(importJob.detectedFieldMappings.titlePath).toBe("title");
      expect(importJob.detectedFieldMappings.descriptionPath).toBe("description");
      // But should still detect German timestamp field
      expect(importJob.detectedFieldMappings.timestampPath).toBe("datum");
    });

    it("should create events with mixed language field names", async () => {
      const { importFile, importJob } = await importLanguageCSV("events-mixed-english-german.csv", "deu");

      await simulateSchemaApproval(importJob.id);
      const completed = await runJobsUntilComplete(importFile.id);
      expect(completed).toBe(true);

      const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
      const events = await payload.find({
        collection: "events",
        where: {
          dataset: { equals: datasetId },
        },
        sort: "eventTimestamp", // Sort by timestamp for consistent order
      });

      expect(events.docs.length).toBe(2);

      // Verify first event (earliest timestamp) has correct data
      const firstEvent = events.docs[0];
      expect(firstEvent.data).toBeDefined();
      expect(firstEvent.data.title).toBeDefined();
      expect(firstEvent.data.description).toBeDefined();
      expect(firstEvent.eventTimestamp).toBeDefined();
    });
  });

  // Note: Field mappings are stored on import-job.detectedFieldMappings, not dataset.fieldMappingOverrides
  // fieldMappingOverrides is for manual user overrides, detectedFieldMappings is auto-detected per import
});
