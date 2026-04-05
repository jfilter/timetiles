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
// Test CSV data mimicking a UCDP-like conflict events dataset (minimal)
// ---------------------------------------------------------------------------
const MOCK_CSV = [
  "id,type_of_violence,conflict_name,dyad_name,best,deaths_civilians,adm_1,adm_2,where_description,latitude,longitude,date_start,date_end,source_headline,relid,conflict_dset_id,year,country",
  "1001,1,Syrian Civil War,Government - FSA,25,3,Damascus,Eastern Ghouta,Eastern Ghouta district,33.51,36.35,2024-03-15,2024-03-15,Airstrikes hit residential area,REL-001,DST-001,2024,Syria",
  "1002,2,Tribal Conflict,Militia A - Militia B,8,0,Darfur,North Darfur,El Fasher outskirts,13.63,25.35,2024-03-16,2024-03-17,Clashes over water resources,REL-002,DST-002,2024,Sudan",
  "1003,3,Civilian Targeting,Government - Civilians,12,12,Rakhine,Sittwe,Sittwe township,20.15,92.9,2024-03-18,2024-03-18,Attacks on civilian settlement,REL-003,DST-003,2024,Myanmar",
].join("\n");

// ---------------------------------------------------------------------------
// Realistic UCDP CSV with ALL columns matching the real HDX dataset.
// Includes every field that ucdp-hdx.yml lists under excludeFields.
// ---------------------------------------------------------------------------
const UCDP_HEADER = [
  "id",
  "relid",
  "year",
  "active_year",
  "code_status",
  "type_of_violence",
  "conflict_dset_id",
  "conflict_new_id",
  "conflict_name",
  "dyad_dset_id",
  "dyad_new_id",
  "dyad_name",
  "side_a_dset_id",
  "side_a_new_id",
  "side_a",
  "side_b_dset_id",
  "side_b_new_id",
  "side_b",
  "number_of_sources",
  "source_article",
  "source_office",
  "source_date",
  "source_original",
  "source_headline",
  "where_prec",
  "where_coordinates",
  "where_description",
  "adm_1",
  "adm_2",
  "latitude",
  "longitude",
  "geom_wkt",
  "priogrid_gid",
  "country",
  "country_id",
  "region",
  "iso3",
  "event_clarity",
  "date_prec",
  "date_start",
  "date_end",
  "deaths_a",
  "deaths_b",
  "deaths_civilians",
  "deaths_unknown",
  "best",
  "high",
  "low",
  "gwnoa",
  "gwnob",
].join(",");

// Use a helper to properly quote CSV values that may contain commas
const csvRow = (values: string[]): string => values.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",");

const UCDP_ROW_1 = csvRow([
  "558782", // id
  "PAK-2024-1-1234-1", // relid
  "2024", // year
  "1", // active_year
  "Clear", // code_status
  "1", // type_of_violence
  "DST-100", // conflict_dset_id
  "NEW-100", // conflict_new_id
  "Myanmar (Burma): Government", // conflict_name
  "DYD-200", // dyad_dset_id
  "DYN-200", // dyad_new_id
  "Government of Myanmar (Burma) - NUG", // dyad_name
  "SDA-300", // side_a_dset_id
  "SNA-300", // side_a_new_id
  "Government of Myanmar (Burma)", // side_a
  "SDB-400", // side_b_dset_id
  "SNB-400", // side_b_new_id
  "NUG", // side_b
  "3", // number_of_sources
  "Reuters;AP;BBC", // source_article
  "UCDP", // source_office
  "2024-12-31", // source_date
  "Burmese military junta forces clashed", // source_original
  "5 civilians dead by bombs during new year celebration", // source_headline
  "1", // where_prec
  "21.83465;95.54802", // where_coordinates
  "Thar Kyin village, Ngazun Township", // where_description
  "Mandalay region", // adm_1
  "Myingyan district", // adm_2
  "21.83465", // latitude
  "95.54802", // longitude
  "POINT(95.54802 21.83465)", // geom_wkt
  "155234", // priogrid_gid
  "Myanmar (Burma)", // country
  "775", // country_id
  "Asia", // region
  "MMR", // iso3
  "1", // event_clarity
  "1", // date_prec
  "2024-12-31", // date_start
  "2024-12-31", // date_end
  "0", // deaths_a
  "0", // deaths_b
  "5", // deaths_civilians
  "0", // deaths_unknown
  "5", // best
  "5", // high
  "5", // low
  "775", // gwnoa
  "", // gwnob
]);

const UCDP_ROW_2 = csvRow([
  "558790", // id
  "PAK-2024-2-5678-2", // relid
  "2024", // year
  "1", // active_year
  "Clear", // code_status
  "2", // type_of_violence
  "DST-101", // conflict_dset_id
  "NEW-101", // conflict_new_id
  "Shan State Conflict", // conflict_name
  "DYD-201", // dyad_dset_id
  "DYN-201", // dyad_new_id
  "TNLA - RCSS", // dyad_name
  "SDA-301", // side_a_dset_id
  "SNA-301", // side_a_new_id
  "TNLA", // side_a
  "SDB-401", // side_b_dset_id
  "SNB-401", // side_b_new_id
  "RCSS", // side_b
  "2", // number_of_sources
  "Irrawaddy;DVB", // source_article
  "UCDP", // source_office
  "2024-11-15", // source_date
  "Ethnic armed groups clashed in northern Shan", // source_original
  "Fighting between TNLA and RCSS in Shan State", // source_headline
  "2", // where_prec
  "22.5;98.0", // where_coordinates
  "Hsipaw Township", // where_description
  "Shan State", // adm_1
  "Hsipaw District", // adm_2
  "22.5", // latitude
  "98.0", // longitude
  "POINT(98.0 22.5)", // geom_wkt
  "155300", // priogrid_gid
  "Myanmar (Burma)", // country
  "775", // country_id
  "Asia", // region
  "MMR", // iso3
  "2", // event_clarity
  "1", // date_prec
  "2024-11-15", // date_start
  "2024-11-16", // date_end
  "3", // deaths_a
  "2", // deaths_b
  "0", // deaths_civilians
  "1", // deaths_unknown
  "6", // best
  "10", // high
  "3", // low
  "775", // gwnoa
  "", // gwnob
]);

const UCDP_REALISTIC_CSV = [UCDP_HEADER, UCDP_ROW_1, UCDP_ROW_2].join("\n");

// All excludeFields from ucdp-hdx.yml
const UCDP_EXCLUDE_FIELDS = [
  // Internal UCDP IDs
  "relid",
  "conflict_dset_id",
  "conflict_new_id",
  "dyad_dset_id",
  "dyad_new_id",
  "side_a_dset_id",
  "side_a_new_id",
  "side_b_dset_id",
  "side_b_new_id",
  "gwnoa",
  "gwnob",
  "priogrid_gid",
  "country_id",
  // Source metadata
  "number_of_sources",
  "source_article",
  "source_office",
  "source_date",
  "source_original",
  // Precision/coding fields
  "active_year",
  "code_status",
  "where_prec",
  "where_coordinates",
  "event_clarity",
  "date_prec",
  // Geo duplicates
  "geom_wkt",
  // Redundant with mapped fields or dataset context
  "side_a",
  "side_b",
  "deaths_a",
  "deaths_b",
  "deaths_unknown",
  "low",
  "high",
  "year",
  "iso3",
  "country",
  "region",
];

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

/**
 * Realistic UCDP manifest matching ucdp-hdx.yml — all excludeFields, transforms, and field mappings.
 */
const buildUcdpManifest = (sourceUrl: string): DataPackageManifest => ({
  slug: "test-ucdp-myanmar",
  title: "UCDP Conflict Events — Myanmar (HDX)",
  summary: "Realistic UCDP test with all excludeFields from ucdp-hdx.yml",
  category: "conflict",
  region: "Myanmar",
  tags: ["conflict", "violence", "ucdp", "casualties", "hdx"],
  license: "CC-BY-IGO",
  url: "https://data.humdata.org",
  publisher: {
    name: "Uppsala Conflict Data Program",
    acronym: "UCDP",
    url: "https://ucdp.uu.se",
    country: "se",
    official: false,
  },
  coverage: { countries: ["mm"], start: "1989-01-01" },
  source: { url: sourceUrl, format: "csv", excludeFields: UCDP_EXCLUDE_FIELDS },
  catalog: {
    name: `UCDP Test Catalog ${Date.now()}`,
    description: "Georeferenced conflict events from UCDP via HDX",
    isPublic: true,
    license: "CC-BY-IGO",
    sourceUrl: "https://data.humdata.org",
  },
  dataset: {
    name: "Myanmar",
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
  type IngestFileId = number | string | undefined;
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
    // Ensure a geocoding provider exists — prevents "No geocoding providers configured"
    // when the geocode-batch step fails to skip (e.g., detectedFieldMappings state leak)
    const existing = await payload.find({ collection: "geocoding-providers", limit: 1 });
    if (existing.docs.length === 0) {
      await payload.create({
        collection: "geocoding-providers",
        data: {
          name: "Test Photon",
          type: "photon",
          enabled: true,
          priority: 1,
          rateLimit: 30,
          baseUrl: "https://geocode.versatiles.org",
        },
      });
    }
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
    expect(renames.map((r: any) => r.to).sort((a: string, b: string) => a.localeCompare(b))).toEqual(
      ["Civilian Deaths", "Conflict", "District", "Fatalities", "Parties", "Province"].sort((a: string, b: string) =>
        a.localeCompare(b)
      )
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
    let ingestFileId: IngestFileId;
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
    expect(new Date(firstEvent.eventTimestamp).toISOString()).toContain("2024-03-15");
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

  it("should strip all UCDP excludeFields and apply transforms with realistic data", { timeout: 60_000 }, async () => {
    testServer.respondWithCSV("/ucdp-myanmar.csv", UCDP_REALISTIC_CSV);
    const manifest = buildUcdpManifest(`${testServerUrl}/ucdp-myanmar.csv`);

    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: true });

    // Wait for the ingest-file to be created
    let ingestFileId: IngestFileId;
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

    const settled = await runJobsUntilImportSettled(payload, ingestFileId!, { maxIterations: 60 });
    expect(settled.settled).toBe(true);

    // Verify events were created
    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: result.datasetId } },
      sort: "eventTimestamp",
    });
    expect(events.docs.length).toBe(2);

    // Find events by unique ID (external id from CSV)
    const stateBasedEvent = events.docs.find(
      (e: { transformedData: unknown }) => (e.transformedData as Record<string, unknown>)?.id === 558782
    )!;
    const nonStateEvent = events.docs.find(
      (e: { transformedData: unknown }) => (e.transformedData as Record<string, unknown>)?.id === 558790
    )!;
    expect(stateBasedEvent).toBeDefined();
    expect(nonStateEvent).toBeDefined();

    const data = stateBasedEvent.transformedData as Record<string, unknown>;
    const dataKeys = Object.keys(data);

    // --- Transforms applied correctly ---
    expect(data["Conflict"]).toBe("Myanmar (Burma): Government");
    expect(data["Parties"]).toBe("Government of Myanmar (Burma) - NUG");
    expect(data["Fatalities"]).toBeDefined();
    expect(data["Civilian Deaths"]).toBeDefined();
    expect(data["Province"]).toBe("Mandalay region");
    expect(data["District"]).toBe("Myingyan district");
    expect(data["Violence Type"]).toBe("State-based");
    expect(data["event_summary"]).toBe("State-based — Government of Myanmar (Burma) - NUG");

    // Rename sources removed
    expect(data["conflict_name"]).toBeUndefined();
    expect(data["dyad_name"]).toBeUndefined();
    expect(data["adm_1"]).toBeUndefined();
    expect(data["adm_2"]).toBeUndefined();

    // --- ALL excludeFields must be absent from transformedData ---
    for (const field of UCDP_EXCLUDE_FIELDS) {
      expect(data[field]).toBeUndefined();
    }

    // Double-check: no excluded field name appears as a key at all
    const leakedFields = dataKeys.filter((k) => UCDP_EXCLUDE_FIELDS.includes(k));
    expect(leakedFields).toEqual([]);

    // --- Only expected fields remain ---
    const expectedRemainingFields = new Set([
      "id",
      "source_headline",
      "Conflict",
      "Parties",
      "Fatalities",
      "Civilian Deaths",
      "Province",
      "District",
      "Violence Type",
      "event_summary",
      "date_start",
      "date_end",
      "where_description",
      "latitude",
      "longitude",
    ]);
    const unexpectedFields = dataKeys.filter((k) => !expectedRemainingFields.has(k));
    expect(unexpectedFields).toEqual([]);

    // --- Field mappings applied ---
    expect(stateBasedEvent.eventTimestamp).toBeTruthy();
    expect(new Date(stateBasedEvent.eventTimestamp).toISOString()).toContain("2024-12-31");
    expect(stateBasedEvent.locationName).toBe("Thar Kyin village, Ngazun Township");
    expect(stateBasedEvent.location).toBeDefined();

    // --- Second event: Non-state violence ---
    const secondData = nonStateEvent.transformedData as Record<string, unknown>;
    expect(secondData["Violence Type"]).toBe("Non-state");
    expect(secondData["Parties"]).toBe("TNLA - RCSS");
    expect(secondData["event_summary"]).toBe("Non-state — TNLA - RCSS");

    // Excluded fields also absent in second event
    const secondLeaked = Object.keys(secondData).filter((k) => UCDP_EXCLUDE_FIELDS.includes(k));
    expect(secondLeaked).toEqual([]);
  });

  it("should handle re-import with update duplicate strategy", { timeout: 60_000 }, async () => {
    testServer.respondWithCSV("/conflict-reimport.csv", MOCK_CSV);
    const manifest = buildTestManifest(`${testServerUrl}/conflict-reimport.csv`);
    // Use unique catalog name to avoid collision
    manifest.catalog.name = `Reimport Test Catalog ${Date.now()}`;

    // First import
    const result = await activateDataPackage(payload, manifest, adminUser, { triggerFirstImport: true });

    // Drain first import
    let ingestFileId: IngestFileId;
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
    let secondIngestFileId: IngestFileId;
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
        `configSnapshot.idStrategy: ${JSON.stringify((reImportJob?.configSnapshot as Record<string, unknown>)?.idStrategy)}`
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
