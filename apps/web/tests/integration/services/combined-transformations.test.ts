/**
 * Integration tests for combined transformation types working together.
 *
 * This test suite verifies that all three transformation types work harmoniously
 * in a single import pipeline:
 * 1. Field Mappings - Language-aware semantic field detection
 * 2. Import Transforms - Field renames/mappings applied during import
 * 3. Type Transformations - Data type conversions
 *
 * Tests ensure proper order of operations and interaction between transformation types.
 *
 * @module
 * @category Integration Tests
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Event } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Combined Transformations Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;

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

    const { catalog } = await withCatalog(testEnv, {
      name: "Combined Transformations Test Catalog",
      description: "Testing all three transformation types together",
    });
    testCatalogId = catalog.id;
  });

  // Helper functions

  const runJobsUntilComplete = async (importFileId: string, maxIterations = 50) => {
    let pipelineComplete = false;
    let iteration = 0;

    while (!pipelineComplete && iteration < maxIterations) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importFile = await payload.findByID({
        collection: "import-files",
        id: importFileId,
      });

      pipelineComplete = importFile.status === "completed" || importFile.status === "failed";

      if (!pipelineComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return iteration < maxIterations;
  };

  const simulateSchemaApproval = async (importJobId: string) => {
    // Create a test user for approval
    const { users } = await withUsers(testEnv, {
      approver: { role: "admin" },
    });
    const testUser = users.approver;

    // Get the current job
    const beforeJob = await payload.findByID({
      collection: "import-jobs",
      id: importJobId,
    });

    // Update the approval fields
    const updatedSchemaValidation = {
      ...beforeJob.schemaValidation,
      approved: true,
      approvedBy: testUser.id,
      approvedAt: new Date().toISOString(),
    };

    await payload.update({
      collection: "import-jobs",
      id: importJobId,
      data: {
        schemaValidation: updatedSchemaValidation,
      },
      user: testUser, // Pass user context for authentication
    });
  };

  const getEventData = (event: Event): Record<string, unknown> => {
    return typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : {};
  };

  const loadCSVFixture = (filename: string): Buffer => {
    const fixturePath = path.join(__dirname, "../../fixtures", filename);
    return fs.readFileSync(fixturePath);
  };

  // Test 1: All three transformations applied together

  it("should apply field mappings, import transforms, and type transformations together", async () => {
    /**
     * This test uses German CSV with:
     * - Ereignis_Titel: Needs import transform to "titel", then field mapping detects it
     * - Teilnehmer_Anzahl: String number needing type transformation to number
     * - Datum_Start: German date field for field mapping detection
     * - Beschreibung: German description field for field mapping detection
     */

    // Create dataset with German language and transformations
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Combined Transform Dataset ${Date.now()}`,
      language: "deu", // German
      schemaConfig: {
        allowTransformations: true,
      },
      importTransforms: [
        {
          id: "transform-1",
          type: "rename",
          from: "Ereignis_Titel",
          to: "titel",
          active: true,
          autoDetected: false,
        },
        {
          id: "transform-2",
          type: "type-cast",
          from: "Teilnehmer_Anzahl",
          fromType: "string",
          toType: "number",
          strategy: "parse",
          active: true,
        },
      ],
      idStrategy: {
        type: "auto",
      },
    });

    // Upload German CSV with datasetMapping metadata to specify which dataset to use
    const csvBuffer = loadCSVFixture("events-combined-transforms-german.csv");
    const { importFile } = await withImportFile(testEnv, testCatalogId, csvBuffer, {
      filename: "events-combined-transforms-german.csv",
      mimeType: "text/csv",
      additionalData: {
        metadata: {
          datasetMapping: {
            mappingType: "single",
            singleDataset: dataset.id,
          },
        },
      },
    });

    // Wait for schema detection to complete
    let schemaDetectionComplete = false;
    let iteration = 0;
    let importJob: any;

    while (!schemaDetectionComplete && iteration < 20) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        importJob = importJobs.docs[0];
        schemaDetectionComplete =
          importJob.stage === "await-approval" || importJob.stage === "completed" || importJob.stage === "failed";
      }

      if (!schemaDetectionComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    expect(schemaDetectionComplete).toBe(true);

    // Approve schema
    await simulateSchemaApproval(importJob.id);

    // Complete the rest of the pipeline
    const completed = await runJobsUntilComplete(importFile.id);
    expect(completed).toBe(true);

    // Reload import job to see detected field mappings
    const completedJob = await payload.findByID({
      collection: "import-jobs",
      id: importJob.id,
    });

    // Verify field mappings were detected (after import transform applied)
    expect(completedJob.detectedFieldMappings).toBeDefined();
    expect(completedJob.detectedFieldMappings.titlePath).toBe("titel"); // Transformed from Ereignis_Titel
    expect(completedJob.detectedFieldMappings.descriptionPath).toBe("beschreibung");
    expect(completedJob.detectedFieldMappings.timestampPath).toBe("datum");

    // Verify events were created
    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
      sort: "eventTimestamp",
    });

    expect(events.docs.length).toBe(3);

    // Verify first event has all transformations applied
    const firstEvent = events.docs[0];
    const firstEventData = getEventData(firstEvent);

    // 1. Import transform applied: Ereignis_Titel → titel
    expect(firstEventData.titel).toBe("Technische Konferenz");
    expect(firstEventData.Ereignis_Titel).toBeUndefined(); // Original field removed

    // 2. Type transformation resulted in number (Papa Parse auto-converted)
    // Note: CSV parser with dynamicTyping=true converts "150" to 150 before type transformation runs
    expect(firstEventData.Teilnehmer_Anzahl).toBe(150);
    expect(typeof firstEventData.Teilnehmer_Anzahl).toBe("number");

    // 3. Other German fields preserved (datum was parsed to ISO format by CSV parser)
    expect(firstEventData.beschreibung).toBe("Eine wichtige Konferenz über Technologie");
    expect(firstEventData.datum).toBe("2024-01-15"); // Papa Parse converted DD.MM.YYYY to YYYY-MM-DD

    // Verify all three events
    expect(events.docs[0].data).toMatchObject({
      titel: "Technische Konferenz",
      Teilnehmer_Anzahl: 150,
      beschreibung: "Eine wichtige Konferenz über Technologie",
    });

    expect(events.docs[1].data).toMatchObject({
      titel: "Musik Festival",
      Teilnehmer_Anzahl: 2500,
      beschreibung: "Großes Open-Air Musikfestival",
    });

    expect(events.docs[2].data).toMatchObject({
      titel: "Wissenschaftssymposium",
      Teilnehmer_Anzahl: 75,
      beschreibung: "Akademische Diskussionsrunde",
    });
  });

  // Test 2: Transformation order verification

  it("should apply transformations in correct order: import transforms → type transforms", async () => {
    /**
     * This test verifies the order of operations:
     * 1. Import transform renames field
     * 2. Type transformation operates on renamed field
     */

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Order Test Dataset ${Date.now()}`,
      language: "deu",
      schemaConfig: {
        allowTransformations: true,
      },
      // First: rename attendee_count → Teilnehmer_Anzahl, then convert to number
      importTransforms: [
        {
          id: "transform-1",
          type: "rename",
          from: "attendee_count",
          to: "Teilnehmer_Anzahl",
          active: true,
          autoDetected: false,
        },
        {
          id: "transform-2",
          type: "type-cast",
          from: "Teilnehmer_Anzahl",
          fromType: "string",
          toType: "number",
          strategy: "parse",
          active: true,
        },
      ],
      idStrategy: {
        type: "auto",
      },
    });

    // Create CSV with original field name "attendee_count"
    const csvContent = `event_name,attendee_count,description
Conference,150,Technical conference
Festival,2500,Music festival`;

    const { importFile } = await withImportFile(testEnv, testCatalogId, Buffer.from(csvContent), {
      filename: "order-test.csv",
      mimeType: "text/csv",
      additionalData: {
        metadata: {
          datasetMapping: {
            mappingType: "single",
            singleDataset: dataset.id,
          },
        },
      },
    });

    // Wait for schema detection to complete
    let schemaDetectionComplete = false;
    let iteration = 0;
    let importJob: any;

    while (!schemaDetectionComplete && iteration < 20) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        importJob = importJobs.docs[0];
        schemaDetectionComplete =
          importJob.stage === "await-approval" || importJob.stage === "completed" || importJob.stage === "failed";
      }

      if (!schemaDetectionComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    expect(schemaDetectionComplete).toBe(true);

    // Approve schema
    await simulateSchemaApproval(importJob.id);

    // Complete the rest of the pipeline
    const completed = await runJobsUntilComplete(importFile.id);
    expect(completed).toBe(true);

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
      sort: "eventTimestamp",
    });

    expect(events.docs.length).toBe(2);

    const firstEvent = events.docs[0];
    const firstEventData = getEventData(firstEvent);

    // Verify both transformations applied
    expect(firstEventData.Teilnehmer_Anzahl).toBe(150); // Renamed AND converted to number
    expect(typeof firstEventData.Teilnehmer_Anzahl).toBe("number");
    expect(firstEventData.attendee_count).toBeUndefined(); // Original field removed
  });

  // Test 3: Field mapping + import transform interaction

  it("should detect field mappings on transformed field names", async () => {
    /**
     * Tests that field mapping detection happens AFTER import transforms:
     * - Import transform: event_name → titel
     * - Field mapping should detect "titel" as German title field
     */

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Mapping Interaction Dataset ${Date.now()}`,
      language: "deu", // German
      importTransforms: [
        {
          id: "transform-1",
          type: "rename",
          from: "event_name",
          to: "titel", // German word for "title"
          active: true,
          autoDetected: false,
        },
      ],
      idStrategy: {
        type: "auto",
      },
    });

    const csvContent = `event_name,description,date
Konferenz,Technical event,2024-01-15
Workshop,Learning session,2024-02-20`;

    const { importFile } = await withImportFile(testEnv, testCatalogId, Buffer.from(csvContent), {
      filename: "mapping-interaction-test.csv",
      mimeType: "text/csv",
      additionalData: {
        metadata: {
          datasetMapping: {
            mappingType: "single",
            singleDataset: dataset.id,
          },
        },
      },
    });

    // Wait for schema detection to complete
    let schemaDetectionComplete = false;
    let iteration = 0;
    let importJob: any;

    while (!schemaDetectionComplete && iteration < 20) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        importJob = importJobs.docs[0];
        schemaDetectionComplete =
          importJob.stage === "await-approval" || importJob.stage === "completed" || importJob.stage === "failed";
      }

      if (!schemaDetectionComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    expect(schemaDetectionComplete).toBe(true);

    // Field mapping should detect the TRANSFORMED field name "titel"
    expect(importJob.detectedFieldMappings).toBeDefined();
    expect(importJob.detectedFieldMappings.titlePath).toBe("titel");
    expect(importJob.detectedFieldMappings.descriptionPath).toBe("description");
    expect(importJob.detectedFieldMappings.timestampPath).toBe("date");
  });

  // Test 4: Import transform + type transform interaction

  it("should apply type transformations to import-transformed fields", async () => {
    /**
     * Tests that type transformations work on fields that were renamed by import transforms:
     * - Import transform: count → anzahl
     * - Type transform: anzahl string → number
     */

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Type Interaction Dataset ${Date.now()}`,
      language: "eng",
      schemaConfig: {
        allowTransformations: true,
      },
      importTransforms: [
        {
          id: "transform-1",
          type: "rename",
          from: "count",
          to: "anzahl",
          active: true,
          autoDetected: false,
        },
        {
          id: "transform-2",
          type: "type-cast",
          from: "anzahl", // Transformed field name
          fromType: "string",
          toType: "number",
          strategy: "parse",
          active: true,
        },
      ],
      idStrategy: {
        type: "auto",
      },
    });

    const csvContent = `name,count,description
Event A,100,First event
Event B,200,Second event`;

    const { importFile } = await withImportFile(testEnv, testCatalogId, Buffer.from(csvContent), {
      filename: "type-interaction-test.csv",
      mimeType: "text/csv",
      additionalData: {
        metadata: {
          datasetMapping: {
            mappingType: "single",
            singleDataset: dataset.id,
          },
        },
      },
    });

    // Wait for schema detection to complete
    let schemaDetectionComplete = false;
    let iteration = 0;
    let importJob: any;

    while (!schemaDetectionComplete && iteration < 20) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        importJob = importJobs.docs[0];
        schemaDetectionComplete =
          importJob.stage === "await-approval" || importJob.stage === "completed" || importJob.stage === "failed";
      }

      if (!schemaDetectionComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    expect(schemaDetectionComplete).toBe(true);

    // Approve schema
    await simulateSchemaApproval(importJob.id);

    // Complete the rest of the pipeline
    const completed = await runJobsUntilComplete(importFile.id);
    expect(completed).toBe(true);

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
      sort: "eventTimestamp",
    });

    expect(events.docs.length).toBe(2);

    // Verify both transformations applied in sequence
    const firstEventData = getEventData(events.docs[0]);
    expect(firstEventData.anzahl).toBe(100); // Renamed from "count" and converted to number
    expect(typeof firstEventData.anzahl).toBe("number");
    expect(firstEventData.count).toBeUndefined(); // Original field removed

    const secondEventData = getEventData(events.docs[1]);
    expect(secondEventData.anzahl).toBe(200);
    expect(typeof secondEventData.anzahl).toBe("number");
  });
});
