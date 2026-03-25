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
import { extractRelationId } from "@/lib/utils/relation-id";

import {
  createIntegrationTestEnvironment,
  runJobsUntilImportSettled,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Multi-Language Import Tests", () => {
  const collectionsToReset = [
    "events",
    "ingest-files",
    "ingest-jobs",
    "datasets",
    "dataset-schemas",
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

    // Create test users (stable across tests)
    const { users } = await withUsers(testEnv, { importer: { role: "user" }, approver: { role: "admin" } });
    importerUserId = users.importer.id;
    approverUser = users.approver;

    // Create test catalog owned by the importer (stable across tests)
    const { catalog } = await withCatalog(testEnv, {
      name: "Multi-Language Test Catalog",
      description: "Catalog for testing multi-language field detection",
      user: users.importer,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear mutable collections only (users and catalog are stable in beforeAll)
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  // Helper functions

  const runJobsUntilComplete = async (ingestFileId: string, maxIterations = 50) => {
    const result = await runJobsUntilImportSettled(payload, ingestFileId, {
      maxIterations,
      onPending: ({ iteration, ingestFile }) => {
        if (iteration % 10 === 0) {
          logger.debug(`Iteration ${iteration}: File status=${ingestFile.status}`);
        }
      },
    });

    return result.settled;
  };

  const simulateSchemaApproval = async (ingestJobId: string) => {
    const beforeJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJobId });

    const updatedSchemaValidation = {
      ...beforeJob.schemaValidation,
      approved: true,
      approvedBy: approverUser.id,
      approvedAt: new Date().toISOString(),
    };

    await payload.update({
      collection: "ingest-jobs",
      id: ingestJobId,
      data: { schemaValidation: updatedSchemaValidation },
      user: approverUser, // Pass user context for authentication
    });
  };

  const importLanguageCSV = async (fixtureName: string, language: string) => {
    const fixturePath = path.join(__dirname, "../../fixtures", fixtureName);
    const fileBuffer = fixtureCache.get(fixtureName) ?? fs.readFileSync(fixturePath);
    fixtureCache.set(fixtureName, fileBuffer);

    // Create dataset with language setting - name must match the CSV filename for dataset-detection to find it
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: fixtureName, // Must match ingestFile.originalName for dataset-detection to reuse it
      language,
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    // Upload CSV file - dataset-detection will find our pre-created dataset by name
    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
      filename: fixtureName,
      mimeType: "text/csv",
      user: importerUserId,
      datasetsCount: 0,
      datasetsProcessed: 0,
      triggerWorkflow: true,
    });

    const schemaDetectionResult = await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) =>
        ingestJob.stage === "validate-schema" || ingestJob.stage === "create-events" || ingestJob.stage === "completed",
      {
        maxIterations: 20,
        onPending: ({ iteration, ingestJob }) => {
          if (iteration % 5 !== 0) {
            return;
          }

          logger.debug("Waiting for language import schema detection", {
            fixtureName,
            iteration,
            stage: ingestJob?.stage ?? "missing",
          });
        },
      }
    );
    expect(schemaDetectionResult.matched).toBe(true);

    // Get the final import job with related data
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
      sort: "createdAt",
      depth: 2,
    });

    expect(importJobs.docs.length).toBeGreaterThan(0);
    const ingestJob = importJobs.docs[0];

    return { ingestFile, ingestJob, dataset };
  };

  const assertDetectedFieldMappings = (
    ingestJob: any,
    expectedMappings: { titlePath: string; descriptionPath: string; timestampPath: string }
  ) => {
    expect(ingestJob.detectedFieldMappings).toBeDefined();
    expect(ingestJob.detectedFieldMappings.titlePath).toBe(expectedMappings.titlePath);
    expect(ingestJob.detectedFieldMappings.descriptionPath).toBe(expectedMappings.descriptionPath);
    expect(ingestJob.detectedFieldMappings.timestampPath).toBe(expectedMappings.timestampPath);
  };

  const assertImportedEvents = async (ingestJob: any, expectedEventCount: number, expectedFields: string[]) => {
    const datasetId = extractRelationId(ingestJob.dataset);
    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: datasetId } },
      sort: "eventTimestamp",
    });

    expect(events.docs).toHaveLength(expectedEventCount);

    const firstEvent = events.docs[0];
    expect(firstEvent.transformedData).toBeDefined();
    for (const field of expectedFields) {
      expect(firstEvent.transformedData[field]).toBeDefined();
    }
    expect(firstEvent.eventTimestamp).toBeDefined();
  };

  const languageScenarios = [
    {
      description: "German field mappings and event creation",
      fixtureName: "events-german.csv",
      language: "deu",
      expectedMappings: { titlePath: "titel", descriptionPath: "beschreibung", timestampPath: "datum" },
      expectedEventCount: 3,
      expectedFields: ["titel", "beschreibung"],
    },
    {
      description: "French field mappings and event creation",
      fixtureName: "events-french.csv",
      language: "fra",
      expectedMappings: { titlePath: "titre", descriptionPath: "description", timestampPath: "date" },
      expectedEventCount: 3,
      expectedFields: ["titre", "description"],
    },
    {
      description: "Spanish field mappings and event creation",
      fixtureName: "events-spanish.csv",
      language: "spa",
      expectedMappings: { titlePath: "título", descriptionPath: "descripción", timestampPath: "fecha" },
      expectedEventCount: 3,
      expectedFields: ["título", "descripción"],
    },
    {
      description: "English fallback mappings for German datasets",
      fixtureName: "events-mixed-english-german.csv",
      language: "deu",
      expectedMappings: { titlePath: "title", descriptionPath: "description", timestampPath: "datum" },
      expectedEventCount: 2,
      expectedFields: ["title", "description"],
    },
  ];

  describe("Language Import Scenarios", () => {
    it.each(languageScenarios)("should verify $description", async (scenario) => {
      const { ingestFile, ingestJob } = await importLanguageCSV(scenario.fixtureName, scenario.language);

      assertDetectedFieldMappings(ingestJob, scenario.expectedMappings);

      await simulateSchemaApproval(ingestJob.id);
      const completed = await runJobsUntilComplete(ingestFile.id);
      expect(completed).toBe(true);

      await assertImportedEvents(ingestJob, scenario.expectedEventCount, scenario.expectedFields);
    });
  });

  // Note: Field mappings are stored on import-job.detectedFieldMappings, not dataset.fieldMappingOverrides
  // fieldMappingOverrides is for manual user overrides, detectedFieldMappings is auto-detected per import
});
