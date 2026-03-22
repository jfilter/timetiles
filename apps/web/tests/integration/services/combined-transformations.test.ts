/**
 * Integration tests for combined transformation types working together.
 *
 * This test suite verifies that import transformations work harmoniously
 * in a single import pipeline:
 * 1. Field Mappings - Language-aware semantic field detection
 * 2. Import Transforms - Field renames, string operations, and expressions applied during import
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
  runJobsUntilImportSettled,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Combined Transformations Integration", () => {
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
  let approverUser: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { approver: { role: "admin" } });
    approverUser = users.approver;

    const { catalog } = await withCatalog(testEnv, {
      name: "Combined Transformations Test Catalog",
      description: "Testing all three transformation types together",
      user: approverUser,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  // Helper functions

  const runJobsUntilComplete = async (ingestFileId: string, maxIterations = 50) => {
    const result = await runJobsUntilImportSettled(payload, ingestFileId, { maxIterations });
    return result.settled;
  };

  const waitForSchemaDetection = async (ingestFileId: string | number) => {
    const result = await runJobsUntilIngestJobStage(
      payload,
      ingestFileId,
      (ingestJob) =>
        ingestJob.stage === "needs-review" || ingestJob.stage === "completed" || ingestJob.stage === "failed",
      { maxIterations: 20 }
    );
    expect(result.matched).toBe(true);
    return result.ingestJob;
  };

  const simulateSchemaApproval = async (ingestJobId: string) => {
    // Get the current job
    const beforeJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJobId });

    // Update the approval fields
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

  const getEventData = (event: Event): Record<string, unknown> => {
    return typeof event.originalData === "object" && event.originalData !== null && !Array.isArray(event.originalData)
      ? (event.originalData as Record<string, unknown>)
      : {};
  };

  const loadCSVFixture = (filename: string): Buffer => {
    const fixturePath = path.join(__dirname, "../../fixtures", filename);
    return fs.readFileSync(fixturePath);
  };

  // Test 1: All three transformations applied together

  it("should apply field mappings and import transforms together", async () => {
    /**
     * This test uses German CSV with:
     * - Ereignis_Titel: Needs import transform to "titel", then field mapping detects it
     * - Teilnehmer_Anzahl: String number needing expression transform to number
     * - Datum_Start: German date field for field mapping detection
     * - Beschreibung: German description field for field mapping detection
     */

    // Create dataset with German language and transformations
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Combined Transform Dataset ${Date.now()}`,
      language: "deu", // German
      schemaConfig: { allowTransformations: true },
      ingestTransforms: [
        { id: "transform-1", type: "rename", from: "Ereignis_Titel", to: "titel", active: true, autoDetected: false },
        {
          id: "transform-2",
          type: "string-op",
          from: "Teilnehmer_Anzahl",
          operation: "expression",
          expression: "toNumber(value)",
          active: true,
        },
      ],
      idStrategy: { type: "auto" },
    });

    // Upload German CSV with datasetMapping metadata to specify which dataset to use
    const csvBuffer = loadCSVFixture("events-combined-transforms-german.csv");
    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvBuffer, {
      filename: "events-combined-transforms-german.csv",
      mimeType: "text/csv",
      user: approverUser.id,
      additionalData: { metadata: { datasetMapping: { mappingType: "single", singleDataset: dataset.id } } },
    });

    // Wait for schema detection to complete
    const ingestJob = await waitForSchemaDetection(ingestFile.id);

    // Approve schema
    await simulateSchemaApproval(String(ingestJob!.id));

    // Complete the rest of the pipeline
    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    // Reload import job to see detected field mappings
    const completedJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJob!.id });

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

    expect(events.docs).toHaveLength(3);

    // Verify first event has all transformations applied
    const firstEvent = events.docs[0];
    const firstEventData = getEventData(firstEvent);

    // 1. Import transform applied: Ereignis_Titel → titel
    expect(firstEventData.titel).toBe("Technische Konferenz");
    expect(firstEventData.Ereignis_Titel).toBeUndefined(); // Original field removed

    // 2. Expression transform resulted in number (Papa Parse auto-converted)
    // Note: CSV parser with dynamicTyping=true converts "150" to 150 before expression runs
    expect(firstEventData.Teilnehmer_Anzahl).toBe(150);
    expect(typeof firstEventData.Teilnehmer_Anzahl).toBe("number");

    // 3. Other German fields preserved (datum was parsed to ISO format by CSV parser)
    expect(firstEventData.beschreibung).toBe("Eine wichtige Konferenz über Technologie");
    expect(firstEventData.datum).toBe("2024-01-15"); // Papa Parse converted DD.MM.YYYY to YYYY-MM-DD

    // Verify all three events
    expect(events.docs[0].originalData).toMatchObject({
      titel: "Technische Konferenz",
      Teilnehmer_Anzahl: 150,
      beschreibung: "Eine wichtige Konferenz über Technologie",
    });

    expect(events.docs[1].originalData).toMatchObject({
      titel: "Musik Festival",
      Teilnehmer_Anzahl: 2500,
      beschreibung: "Großes Open-Air Musikfestival",
    });

    expect(events.docs[2].originalData).toMatchObject({
      titel: "Wissenschaftssymposium",
      Teilnehmer_Anzahl: 75,
      beschreibung: "Akademische Diskussionsrunde",
    });
  });

  // Test 2: Transformation order verification

  it("should apply transformations in correct order: rename → expression", async () => {
    /**
     * This test verifies the order of operations:
     * 1. Import transform renames field
     * 2. Expression transform operates on renamed field
     */

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Order Test Dataset ${Date.now()}`,
      language: "deu",
      schemaConfig: { allowTransformations: true },
      // First: rename attendee_count → Teilnehmer_Anzahl, then convert to number
      ingestTransforms: [
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
          type: "string-op",
          from: "Teilnehmer_Anzahl",
          operation: "expression",
          expression: "toNumber(value)",
          active: true,
        },
      ],
      idStrategy: { type: "auto" },
    });

    // Create CSV with original field name "attendee_count"
    const csvContent = `event_name,attendee_count,description
Conference,150,Technical conference
Festival,2500,Music festival`;

    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, Buffer.from(csvContent), {
      user: approverUser.id,
      filename: "order-test.csv",
      mimeType: "text/csv",
      additionalData: { metadata: { datasetMapping: { mappingType: "single", singleDataset: dataset.id } } },
    });

    // Wait for schema detection to complete
    const ingestJob = await waitForSchemaDetection(ingestFile.id);

    // Approve schema
    await simulateSchemaApproval(String(ingestJob!.id));

    // Complete the rest of the pipeline
    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
      sort: "eventTimestamp",
    });

    expect(events.docs).toHaveLength(2);

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
      ingestTransforms: [
        {
          id: "transform-1",
          type: "rename",
          from: "event_name",
          to: "titel", // German word for "title"
          active: true,
          autoDetected: false,
        },
      ],
      idStrategy: { type: "auto" },
    });

    const csvContent = `event_name,description,date
Konferenz,Technical event,2024-01-15
Workshop,Learning session,2024-02-20`;

    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, Buffer.from(csvContent), {
      user: approverUser.id,
      filename: "mapping-interaction-test.csv",
      mimeType: "text/csv",
      additionalData: { metadata: { datasetMapping: { mappingType: "single", singleDataset: dataset.id } } },
    });

    // Wait for schema detection to complete
    const ingestJob = await waitForSchemaDetection(ingestFile.id);

    // Field mapping should detect the TRANSFORMED field name "titel"
    expect(ingestJob!.detectedFieldMappings).toBeDefined();
    expect(ingestJob!.detectedFieldMappings!.titlePath).toBe("titel");
    expect(ingestJob!.detectedFieldMappings!.descriptionPath).toBe("description");
    expect(ingestJob!.detectedFieldMappings!.timestampPath).toBe("date");
  });

  // Test 4: Import transform + type transform interaction

  it("should apply expression transforms to import-transformed fields", async () => {
    /**
     * Tests that expression transforms work on fields that were renamed by import transforms:
     * - Import transform: count → anzahl
     * - Expression transform: anzahl string → number
     */

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Type Interaction Dataset ${Date.now()}`,
      language: "eng",
      schemaConfig: { allowTransformations: true },
      ingestTransforms: [
        { id: "transform-1", type: "rename", from: "count", to: "anzahl", active: true, autoDetected: false },
        {
          id: "transform-2",
          type: "string-op",
          from: "anzahl", // Transformed field name
          operation: "expression",
          expression: "toNumber(value)",
          active: true,
        },
      ],
      idStrategy: { type: "auto" },
    });

    const csvContent = `name,count,description
Event A,100,First event
Event B,200,Second event`;

    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, Buffer.from(csvContent), {
      user: approverUser.id,
      filename: "type-interaction-test.csv",
      mimeType: "text/csv",
      additionalData: { metadata: { datasetMapping: { mappingType: "single", singleDataset: dataset.id } } },
    });

    // Wait for schema detection to complete
    const ingestJob = await waitForSchemaDetection(ingestFile.id);

    // Approve schema
    await simulateSchemaApproval(String(ingestJob!.id));

    // Complete the rest of the pipeline
    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: dataset.id } },
      sort: "eventTimestamp",
    });

    expect(events.docs).toHaveLength(2);

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
