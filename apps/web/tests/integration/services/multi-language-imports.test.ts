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
        importJob.stage === "validate-schema" || importJob.stage === "processing" || importJob.stage === "completed",
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

  const assertDetectedFieldMappings = (
    importJob: any,
    expectedMappings: {
      titlePath: string;
      descriptionPath: string;
      timestampPath: string;
    }
  ) => {
    expect(importJob.detectedFieldMappings).toBeDefined();
    expect(importJob.detectedFieldMappings.titlePath).toBe(expectedMappings.titlePath);
    expect(importJob.detectedFieldMappings.descriptionPath).toBe(expectedMappings.descriptionPath);
    expect(importJob.detectedFieldMappings.timestampPath).toBe(expectedMappings.timestampPath);
  };

  const assertImportedEvents = async (importJob: any, expectedEventCount: number, expectedFields: string[]) => {
    const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
    const events = await payload.find({
      collection: "events",
      where: {
        dataset: { equals: datasetId },
      },
      sort: "eventTimestamp",
    });

    expect(events.docs.length).toBe(expectedEventCount);

    const firstEvent = events.docs[0];
    expect(firstEvent.data).toBeDefined();
    for (const field of expectedFields) {
      expect(firstEvent.data[field]).toBeDefined();
    }
    expect(firstEvent.eventTimestamp).toBeDefined();
  };

  const languageScenarios = [
    {
      description: "German field mappings and event creation",
      fixtureName: "events-german.csv",
      language: "deu",
      expectedMappings: {
        titlePath: "titel",
        descriptionPath: "beschreibung",
        timestampPath: "datum",
      },
      expectedEventCount: 3,
      expectedFields: ["titel", "beschreibung"],
    },
    {
      description: "French field mappings and event creation",
      fixtureName: "events-french.csv",
      language: "fra",
      expectedMappings: {
        titlePath: "titre",
        descriptionPath: "description",
        timestampPath: "date",
      },
      expectedEventCount: 3,
      expectedFields: ["titre", "description"],
    },
    {
      description: "Spanish field mappings and event creation",
      fixtureName: "events-spanish.csv",
      language: "spa",
      expectedMappings: {
        titlePath: "título",
        descriptionPath: "descripción",
        timestampPath: "fecha",
      },
      expectedEventCount: 3,
      expectedFields: ["título", "descripción"],
    },
    {
      description: "English fallback mappings for German datasets",
      fixtureName: "events-mixed-english-german.csv",
      language: "deu",
      expectedMappings: {
        titlePath: "title",
        descriptionPath: "description",
        timestampPath: "datum",
      },
      expectedEventCount: 2,
      expectedFields: ["title", "description"],
    },
  ];

  describe("Language Import Scenarios", () => {
    it.each(languageScenarios)("should verify $description", async (scenario) => {
      const { importFile, importJob } = await importLanguageCSV(scenario.fixtureName, scenario.language);

      assertDetectedFieldMappings(importJob, scenario.expectedMappings);

      await simulateSchemaApproval(importJob.id);
      const completed = await runJobsUntilComplete(importFile.id);
      expect(completed).toBe(true);

      await assertImportedEvents(importJob, scenario.expectedEventCount, scenario.expectedFields);
    });
  });

  // Note: Field mappings are stored on import-job.detectedFieldMappings, not dataset.fieldMappingOverrides
  // fieldMappingOverrides is for manual user overrides, detectedFieldMappings is auto-detected per import
});
