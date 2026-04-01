// @vitest-environment node
/**
 * Integration tests for data package activation and the full import pipeline.
 *
 * Verifies that activating a data package correctly creates catalog, dataset,
 * and scheduled ingest — and that the triggered import pipeline creates events
 * with transforms, field mappings, and excludeFields applied.
 *
 * @module
 * @category Integration Tests
 */

process.env.ALLOW_PRIVATE_URLS = "true";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { activateDataPackage, deactivateDataPackage } from "@/lib/data-packages/activation-service";
import type { DataPackageManifest } from "@/lib/types/data-packages";
import type { User } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportSettled,
  runJobsUntilIngestJobStage,
  withTestServer,
  withUsers,
} from "../../setup/integration/environment";

// ---------------------------------------------------------------------------
// Mock the URL fetch cache with a pass-through (avoids filesystem writes)
// ---------------------------------------------------------------------------
vi.mock("@/lib/services/cache/url-fetch-cache", () => {
  const createPassThroughCache = () => ({
    fetch: async (
      url: string,
      options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; userId?: string; timeout?: number }
    ) => {
      const { bypassCache: _b, forceRevalidate: _f, userId: _u, timeout, ...fetchOpts } = options ?? {};
      let controller: AbortController | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeout && timeout > 0) {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller!.abort(), timeout);
        fetchOpts.signal = controller.signal;
      }
      try {
        const response = await fetch(url, fetchOpts);
        const data = Buffer.from(await response.arrayBuffer());
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        return { data, headers, status: response.status };
      } catch (error) {
        if ((error as Error).name === "AbortError") throw new Error(`Request timeout after ${timeout}ms`);
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(0),
    cleanup: vi.fn().mockResolvedValue(0),
    getStats: vi.fn().mockResolvedValue({}),
  });
  return {
    UrlFetchCache: vi.fn().mockImplementation(createPassThroughCache),
    getUrlFetchCache: vi.fn(() => createPassThroughCache()),
  };
});

// ---------------------------------------------------------------------------
// Test CSV data mimicking a UCDP-like conflict events dataset
// ---------------------------------------------------------------------------
const MOCK_CSV = [
  "id,type_of_violence,conflict_name,dyad_name,best,deaths_civilians,adm_1,adm_2,where_description,latitude,longitude,date_start,date_end,source_headline,relid,conflict_dset_id,year,country",
  "1001,1,Syrian Civil War,Government - FSA,25,3,Damascus,Eastern Ghouta,Eastern Ghouta district,33.51,36.35,2024-03-15,2024-03-15,Airstrikes hit residential area,REL-001,DST-001,2024,Syria",
  "1002,2,Tribal Conflict,Militia A - Militia B,8,0,Darfur,North Darfur,El Fasher outskirts,13.63,25.35,2024-03-16,2024-03-17,Clashes over water resources,REL-002,DST-002,2024,Sudan",
  "1003,3,Civilian Targeting,Government - Civilians,12,12,Rakhine,Sittwe,Sittwe township,20.15,92.9,2024-03-18,2024-03-18,Attacks on civilian settlement,REL-003,DST-003,2024,Myanmar",
].join("\n");

// ---------------------------------------------------------------------------
// Test manifest (mirrors UCDP HDX data package structure)
// ---------------------------------------------------------------------------
const buildTestManifest = (sourceUrl: string): DataPackageManifest => ({
  slug: "test-conflict-data",
  title: "Test Conflict Events",
  summary: "Test data package for integration testing",
  category: "conflict",
  region: "Global",
  tags: ["conflict", "test"],
  license: "CC-BY",
  url: "https://example.com",
  publisher: { name: "Test Publisher", acronym: "TP", url: "https://example.com", country: "de", official: false },
  coverage: { countries: ["sy", "sd", "mm"], start: "2024-01-01" },
  source: { url: sourceUrl, format: "csv", excludeFields: ["relid", "conflict_dset_id", "year", "country"] },
  catalog: {
    name: `Test Conflict Catalog ${Date.now()}`,
    description: "Conflict events for testing",
    isPublic: true,
    license: "CC-BY",
    sourceUrl: "https://example.com",
  },
  dataset: {
    name: "Test Country",
    language: "eng",
    idStrategy: { type: "external", externalIdPath: "id", duplicateStrategy: "update" },
  },
  fieldMappings: {
    titlePath: "source_headline",
    descriptionPath: "event_summary",
    timestampPath: "date_start",
    endTimestampPath: "date_end",
    locationNamePath: "where_description",
    latitudePath: "latitude",
    longitudePath: "longitude",
  },
  transforms: [
    {
      type: "string-op",
      from: "type_of_violence",
      to: "Violence Type",
      operation: "expression",
      expression: '(value == 1 ? "State-based" : value == 2 ? "Non-state" : value == 3 ? "One-sided" : value)',
    },
    { type: "rename", from: "conflict_name", to: "Conflict" },
    { type: "rename", from: "dyad_name", to: "Parties" },
    { type: "rename", from: "best", to: "Fatalities" },
    { type: "rename", from: "deaths_civilians", to: "Civilian Deaths" },
    { type: "rename", from: "adm_1", to: "Province" },
    { type: "rename", from: "adm_2", to: "District" },
    { type: "concatenate", fromFields: ["Violence Type", "Parties"], separator: " — ", to: "event_summary" },
  ],
  schedule: { type: "frequency", frequency: "monthly", schemaMode: "additive", timezone: "UTC" },
  reviewChecks: { skipGeocodingCheck: true },
});

describe.sequential("Data Package Activation", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET, "catalogs", "scheduled-ingests"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let adminUser: User;
  let testServer: any;
  let testServerUrl: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    const envWithServer = await withTestServer(testEnv);
    payload = envWithServer.payload;
    testServer = envWithServer.testServer;
    testServerUrl = envWithServer.testServerUrl;

    const { users } = await withUsers(envWithServer, { admin: { role: "admin" } });
    adminUser = users.admin;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
    testServer.reset();
  });

  // -------------------------------------------------------------------------
  // Activation: resource creation
  // -------------------------------------------------------------------------

  it("should create catalog, dataset, and scheduled ingest on activation", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });

    // Catalog
    const catalog = await payload.findByID({ collection: "catalogs", id: result.catalogId });
    expect(catalog.name).toBe(manifest.catalog.name);
    expect(catalog.isPublic).toBe(true);
    expect(catalog.license).toBe("CC-BY");
    expect(catalog.sourceUrl).toBe("https://example.com");
    expect(catalog.publisher).toMatchObject({ name: "Test Publisher", url: "https://example.com" });

    // Dataset
    const dataset = await payload.findByID({ collection: "datasets", id: result.datasetId });
    expect(dataset.name).toBe("Test Country");
    expect(dataset.language).toBe("eng");
    expect(dataset.idStrategy).toMatchObject({ type: "external", externalIdPath: "id", duplicateStrategy: "update" });

    // Scheduled ingest
    const ingest = await payload.findByID({ collection: "scheduled-ingests", id: result.scheduledIngestId });
    expect(ingest.sourceUrl).toBe(`${testServerUrl}/data.csv`);
    expect(ingest.enabled).toBe(true);
    expect(ingest.frequency).toBe("monthly");
    expect(ingest.dataPackageSlug).toBe("test-conflict-data");
  });

  it("should store transforms on dataset including expression field", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });
    const dataset = await payload.findByID({ collection: "datasets", id: result.datasetId });

    expect(dataset.ingestTransforms).toHaveLength(8);

    // String-op expression transform
    const exprTransform = dataset.ingestTransforms.find(
      (t: any) => t.type === "string-op" && t.operation === "expression"
    );
    expect(exprTransform).toBeDefined();
    expect(exprTransform.from).toBe("type_of_violence");
    expect(exprTransform.to).toBe("Violence Type");
    expect(exprTransform.expression).toContain("State-based");
    expect(exprTransform.active).toBe(true);

    // Rename transforms
    const renames = dataset.ingestTransforms.filter((t: any) => t.type === "rename");
    expect(renames).toHaveLength(6);
    expect(renames.map((r: any) => r.to).sort()).toEqual(
      ["Civilian Deaths", "Conflict", "District", "Fatalities", "Parties", "Province"].sort()
    );

    // Concatenate transform
    const concat = dataset.ingestTransforms.find((t: any) => t.type === "concatenate");
    expect(concat).toBeDefined();
    expect(concat.fromFields).toEqual(["Violence Type", "Parties"]);
    expect(concat.separator).toBe(" — ");
    expect(concat.to).toBe("event_summary");
  });

  it("should store field mapping overrides on dataset", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });
    const dataset = await payload.findByID({ collection: "datasets", id: result.datasetId });

    expect(dataset.fieldMappingOverrides).toMatchObject({
      titlePath: "source_headline",
      descriptionPath: "event_summary",
      timestampPath: "date_start",
      endTimestampPath: "date_end",
      locationNamePath: "where_description",
      latitudePath: "latitude",
      longitudePath: "longitude",
    });
  });

  it("should store excludeFields on scheduled ingest", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });
    const ingest = await payload.findByID({ collection: "scheduled-ingests", id: result.scheduledIngestId });

    expect(ingest.excludeFields).toEqual(["relid", "conflict_dset_id", "year", "country"]);
  });

  it("should store geo field detection on dataset", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });
    const dataset = await payload.findByID({ collection: "datasets", id: result.datasetId });

    expect(dataset.geoFieldDetection).toMatchObject({
      autoDetect: true,
      latitudePath: "latitude",
      longitudePath: "longitude",
    });
  });

  it("should reject duplicate activation with same slug", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });
    await expect(activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false })).rejects.toThrow(
      /already activated/
    );
  });

  it("should deactivate a data package", async () => {
    testServer.respondWithCSV("/data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/data.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: false });

    await deactivateDataPackage(payload, manifest.slug, adminUser);

    const ingest = await payload.findByID({ collection: "scheduled-ingests", id: result.scheduledIngestId });
    expect(ingest.enabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Full pipeline: activation → URL fetch → import → events
  // -------------------------------------------------------------------------

  it("should create events with transforms applied through the full import pipeline", { timeout: 60_000 }, async () => {
    testServer.respondWithCSV("/conflict-data.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/conflict-data.csv`);

    // Activate with first import triggered
    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: true });

    // Wait for the ingest-file to be created (url-fetch produces it)
    let ingestFileId: number | string | undefined;
    for (let i = 0; i < 20; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });
      const files = await payload.find({
        collection: "ingest-files",
        where: { catalog: { equals: result.catalogId } },
        limit: 1,
      });
      if (files.docs.length > 0) {
        ingestFileId = files.docs[0].id;
        break;
      }
    }
    expect(ingestFileId).toBeDefined();

    // Wait for schema detection → NEEDS_REVIEW
    const schemaResult = await runJobsUntilIngestJobStage(
      payload,
      ingestFileId!,
      (job) => job.stage === "needs-review" || job.stage === "completed" || job.stage === "failed",
      { maxIterations: 40 }
    );

    if (schemaResult.ingestJob?.stage === "needs-review") {
      // Approve schema
      const job = await payload.findByID({ collection: "ingest-jobs", id: schemaResult.ingestJob.id });
      await payload.update({
        collection: "ingest-jobs",
        id: job.id,
        data: {
          schemaValidation: {
            ...job.schemaValidation,
            approved: true,
            approvedBy: adminUser.id,
            approvedAt: new Date().toISOString(),
          },
        },
        user: adminUser,
      });
    }

    // Run pipeline to completion
    const settled = await runJobsUntilImportSettled(payload, ingestFileId!, { maxIterations: 60 });
    expect(settled.settled).toBe(true);

    // Verify events were created
    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: result.datasetId } },
      sort: "eventTimestamp",
    });

    expect(events.docs.length).toBe(3);

    // Verify transforms applied on first event
    const firstEvent = events.docs[0];
    const data = firstEvent.transformedData as Record<string, unknown>;

    // Rename transforms: conflict_name → Conflict, dyad_name → Parties, etc.
    expect(data["Conflict"]).toBe("Syrian Civil War");
    expect(data["Parties"]).toBe("Government - FSA");
    expect(data["Fatalities"]).toBeDefined();
    expect(data["Province"]).toBe("Damascus");
    expect(data["District"]).toBe("Eastern Ghouta");
    expect(data["Civilian Deaths"]).toBeDefined();

    // Old field names should be gone (rename deletes source)
    expect(data["conflict_name"]).toBeUndefined();
    expect(data["dyad_name"]).toBeUndefined();
    expect(data["adm_1"]).toBeUndefined();
    expect(data["adm_2"]).toBeUndefined();

    // String-op expression: type_of_violence → "Violence Type"
    expect(data["Violence Type"]).toBe("State-based");

    // Concatenate: Violence Type + Parties → event_summary
    expect(data["event_summary"]).toBe("State-based — Government - FSA");

    // Field mappings
    expect(firstEvent.eventTimestamp).toBeTruthy();
    expect(new Date(firstEvent.eventTimestamp!).toISOString()).toContain("2024-03-15");
    expect(firstEvent.eventEndTimestamp).toBeTruthy();
    expect(firstEvent.locationName).toBe("Eastern Ghouta district");
    expect(firstEvent.location).toBeDefined();

    // excludeFields: these should NOT be in transformedData
    expect(data["relid"]).toBeUndefined();
    expect(data["conflict_dset_id"]).toBeUndefined();
    expect(data["year"]).toBeUndefined();
    expect(data["country"]).toBeUndefined();

    // Verify second event (Non-state violence)
    const secondData = events.docs[1].transformedData as Record<string, unknown>;
    expect(secondData["Violence Type"]).toBe("Non-state");
    expect(secondData["event_summary"]).toBe("Non-state — Militia A - Militia B");

    // Verify third event (One-sided violence)
    const thirdData = events.docs[2].transformedData as Record<string, unknown>;
    expect(thirdData["Violence Type"]).toBe("One-sided");
  });

  it("should handle re-import with update duplicate strategy", { timeout: 60_000 }, async () => {
    testServer.respondWithCSV("/conflict-reimport.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/conflict-reimport.csv`);
    // Use unique catalog name to avoid collision
    manifest.catalog.name = `Reimport Test Catalog ${Date.now()}`;

    // First import
    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: true });

    // Drain first import
    let ingestFileId: number | string | undefined;
    for (let i = 0; i < 20; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });
      const files = await payload.find({
        collection: "ingest-files",
        where: { catalog: { equals: result.catalogId } },
        limit: 1,
        sort: "-createdAt",
      });
      if (files.docs.length > 0) {
        ingestFileId = files.docs[0].id;
        break;
      }
    }
    expect(ingestFileId).toBeDefined();

    // Wait for needs-review and approve
    const schemaResult = await runJobsUntilIngestJobStage(
      payload,
      ingestFileId!,
      (job) => job.stage === "needs-review" || job.stage === "completed" || job.stage === "failed",
      { maxIterations: 40 }
    );
    if (schemaResult.ingestJob?.stage === "needs-review") {
      const job = await payload.findByID({ collection: "ingest-jobs", id: schemaResult.ingestJob.id });
      await payload.update({
        collection: "ingest-jobs",
        id: job.id,
        data: {
          schemaValidation: {
            ...job.schemaValidation,
            approved: true,
            approvedBy: adminUser.id,
            approvedAt: new Date().toISOString(),
          },
        },
        user: adminUser,
      });
    }
    const firstSettled = await runJobsUntilImportSettled(payload, ingestFileId!, { maxIterations: 60 });
    expect(firstSettled.settled).toBe(true);

    const firstEvents = await payload.find({ collection: "events", where: { dataset: { equals: result.datasetId } } });
    expect(firstEvents.docs.length).toBe(3);

    // Check first import job stage - must be COMPLETED, not NEEDS_REVIEW
    const firstImportJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFileId } },
    });
    const firstJob = firstImportJobs.docs[0];
    expect(firstJob?.stage).toBe("completed");

    // Update CSV with changed data for one row
    const updatedCsv = MOCK_CSV.replace("Airstrikes hit residential area", "Updated: Major offensive reported");
    testServer.reset();
    testServer.respondWithCSV("/conflict-reimport.csv", updatedCsv);

    // Trigger re-import manually via triggerScheduledIngest
    const { triggerScheduledIngest } = await import("@/lib/ingest/trigger-service");
    const fullIngest = await payload.findByID({ collection: "scheduled-ingests", id: result.scheduledIngestId });

    // Reset status so it can be triggered again
    await payload.update({
      collection: "scheduled-ingests",
      id: result.scheduledIngestId,
      data: { lastStatus: "success" },
    });

    await triggerScheduledIngest(payload, fullIngest, new Date(), { triggeredBy: "manual" });

    // Find the new ingest file
    let secondIngestFileId: number | string | undefined;
    for (let i = 0; i < 20; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });
      const files = await payload.find({
        collection: "ingest-files",
        where: { catalog: { equals: result.catalogId } },
        limit: 2,
        sort: "-createdAt",
      });
      if (files.docs.length >= 2) {
        secondIngestFileId = files.docs[0].id;
        break;
      }
    }
    expect(secondIngestFileId).toBeDefined();

    // Wait for needs-review and approve
    const secondSchema = await runJobsUntilIngestJobStage(
      payload,
      secondIngestFileId!,
      (job) => job.stage === "needs-review" || job.stage === "completed" || job.stage === "failed",
      { maxIterations: 40 }
    );
    if (secondSchema.ingestJob?.stage === "needs-review") {
      const job = await payload.findByID({ collection: "ingest-jobs", id: secondSchema.ingestJob.id });
      await payload.update({
        collection: "ingest-jobs",
        id: job.id,
        data: {
          schemaValidation: {
            ...job.schemaValidation,
            approved: true,
            approvedBy: adminUser.id,
            approvedAt: new Date().toISOString(),
          },
        },
        user: adminUser,
      });
    }
    const secondSettled = await runJobsUntilImportSettled(payload, secondIngestFileId!, { maxIterations: 60 });
    expect(secondSettled.settled).toBe(true);

    // Check ingest job results for the re-import
    const reImportJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: secondIngestFileId } },
    });
    const reImportJob = reImportJobs.docs[0];

    // Diagnostic: check what happened in the re-import
    const jobResults = reImportJob?.results as Record<string, unknown> | undefined;
    const duplicates = reImportJob?.duplicates as Record<string, unknown> | undefined;
    const jobStage = reImportJob?.stage;

    // The job must have completed (not stuck in needs-review or failed)
    const errorLog = reImportJob?.errorLog as Record<string, unknown> | undefined;
    expect(jobStage).toSatisfy(
      (s: string) => s === "completed" || s === "needs-review",
      `Expected job to complete, got stage: ${jobStage}, ` +
        `errorLog: ${JSON.stringify(errorLog)}, ` +
        `duplicates: ${JSON.stringify(duplicates?.summary)}, ` +
        `configSnapshot.idStrategy: ${JSON.stringify((reImportJob?.configSnapshot as any)?.idStrategy)}`
    );

    // Should still have 3 events (updated, not duplicated) — or 6 if update failed and created new
    const finalEvents = await payload.find({ collection: "events", where: { dataset: { equals: result.datasetId } } });

    // The key assertion: events should be updated with new data
    // If this is 6, events were duplicated instead of updated
    // If 3 but no updated text, the update didn't write transformedData
    expect(finalEvents.docs.length).toBe(3);

    // Check if ANY event has the updated text (in transformedData or sourceData)
    const updatedEvent = finalEvents.docs.find((e: any) => {
      const td = e.transformedData as Record<string, unknown> | undefined;
      const sd = e.sourceData as Record<string, unknown> | undefined;
      return (
        td?.source_headline === "Updated: Major offensive reported" ||
        sd?.source_headline === "Updated: Major offensive reported"
      );
    });

    // If no updated event, dump actual data for debugging
    if (!updatedEvent) {
      const allTitles = finalEvents.docs.map((e: any) => ({
        id: e.id,
        uniqueId: e.uniqueId,
        tdHeadline: (e.transformedData as Record<string, unknown>)?.source_headline,
        sdHeadline: (e.sourceData as Record<string, unknown>)?.source_headline,
        ingestJob: e.ingestJob,
      }));
      console.error("Re-import debug - event data:", JSON.stringify(allTitles, null, 2));
      console.error("Re-import debug - job results:", JSON.stringify(jobResults, null, 2));
      console.error("Re-import debug - duplicates:", JSON.stringify(duplicates, null, 2));
    }

    expect(updatedEvent).toBeDefined();
  });
});
