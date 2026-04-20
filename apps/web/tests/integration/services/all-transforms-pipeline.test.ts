/**
 * Integration tests for all 6 import transform types working through the real pipeline.
 *
 * Verifies that rename, date-parse, concatenate, string-op, split, and expression
 * transforms are applied correctly in order when processing a CSV import through
 * the full Payload CMS job pipeline.
 *
 * @module
 * @category Integration Tests
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Event } from "@/payload-types";
import { ProviderManager } from "../../../lib/services/geocoding/provider-manager";
import { resetProviderRateLimiter } from "../../../lib/services/geocoding/provider-rate-limiter";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportSettled,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

const mockGeocode = vi.fn();

const createMockProviders = () => [
  { name: "Mock Geocoder", geocoder: { geocode: mockGeocode } as any, priority: 1, enabled: true, rateLimit: 100 },
];

const applyProviderManagerSpy = () => {
  vi.spyOn(ProviderManager.prototype, "loadProviders").mockImplementation(function (this: any) {
    this.providers = createMockProviders();
    this.configureRateLimiter();
    return Promise.resolve(this.providers);
  });
};

const mockGeocodeResult = (address: string, lat: number, lng: number) => [
  {
    latitude: lat,
    longitude: lng,
    formattedAddress: address,
    country: "Germany",
    countryCode: "DE",
    city: address,
    state: undefined,
    streetName: undefined,
    streetNumber: undefined,
    zipcode: undefined,
    extra: { confidence: 0.85 },
  },
];

describe.sequential("All Transform Types Pipeline", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let approverUser: any;
  let testCatalogId: string;

  beforeAll(async () => {
    applyProviderManagerSpy();
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { approver: { role: "admin" } });
    approverUser = users.approver;

    const { catalog } = await withCatalog(testEnv, {
      name: "All Transforms Pipeline Catalog",
      description: "Testing all 6 transform types in pipeline",
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
    resetProviderRateLimiter();
    applyProviderManagerSpy();
    await testEnv.seedManager.truncate([
      ...IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
      "location-cache",
      "geocoding-providers",
    ]);
    await payload.create({
      collection: "geocoding-providers",
      data: {
        name: "Mock Geocoder",
        type: "google",
        enabled: true,
        priority: 1,
        rateLimit: 100,
        apiKey: "test-api-key-for-mock-geocoding",
        tags: ["testing"],
      },
    });
    mockGeocode.mockReset();
    mockGeocode.mockImplementation((address: string) => {
      const normalizedAddress = typeof address === "string" ? address.toLowerCase().trim() : String(address);
      return mockGeocodeResult(normalizedAddress, 50.0, 10.0);
    });
  });

  // --- Helpers ---

  const waitForSchemaDetection = async (ingestFileId: string | number) => {
    const result = await runJobsUntilIngestJobStage(
      payload,
      ingestFileId,
      (ingestJob) =>
        ingestJob.stage === "needs-review" || ingestJob.stage === "completed" || ingestJob.stage === "failed",
      { maxIterations: 30 }
    );
    expect(result.matched).toBe(true);
    return result.ingestJob;
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
      user: approverUser,
    });
  };

  const runJobsUntilComplete = async (ingestFileId: string, maxIterations = 50) => {
    const result = await runJobsUntilImportSettled(payload, ingestFileId, { maxIterations });
    return result.settled;
  };

  const getEventData = (event: Event): Record<string, unknown> => {
    return typeof event.transformedData === "object" &&
      event.transformedData !== null &&
      !Array.isArray(event.transformedData)
      ? (event.transformedData as Record<string, unknown>)
      : {};
  };

  const loadCSVFixture = (filename: string): Buffer => {
    const fixturePath = path.join(__dirname, "../../fixtures", filename);
    return fs.readFileSync(fixturePath);
  };

  /**
   * Build the standard set of transforms used across tests.
   * The order is critical: concatenate runs BEFORE string-op uppercase.
   * Each call generates unique IDs to avoid conflicts in the shared
   * datasets_ingest_transforms table (isolate: false).
   */
  const buildAllTransforms = () => {
    const uid = Math.random().toString(36).slice(2, 8);
    return [
      { id: `t-rename-${uid}`, type: "rename", from: "event_name", to: "title", active: true, autoDetected: false },
      {
        id: `t-date-${uid}`,
        type: "date-parse",
        from: "event_date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
      {
        id: `t-concat-${uid}`,
        type: "concatenate",
        fromFields: ["venue_city", "venue_country"],
        separator: ", ",
        to: "location",
        active: true,
        autoDetected: false,
      },
      {
        id: `t-upper-${uid}`,
        type: "string-op",
        from: "venue_city",
        operation: "uppercase",
        active: true,
        autoDetected: false,
      },
      {
        id: `t-split-${uid}`,
        type: "split",
        from: "full_address",
        delimiter: " ",
        toFields: ["street_name", "street_number", "split_city"],
        active: true,
        autoDetected: false,
      },
      {
        id: `t-cast-${uid}`,
        type: "string-op",
        from: "attendees",
        operation: "expression",
        expression: "toNumber(value)",
        active: true,
        autoDetected: false,
      },
    ];
  };

  /**
   * Run a full import pipeline for the given dataset and return the created events.
   */
  const runFullImport = async (datasetId: string | number) => {
    const csvBuffer = loadCSVFixture("events-all-transforms.csv");
    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvBuffer, {
      filename: "events-all-transforms.csv",
      mimeType: "text/csv",
      user: approverUser.id,
      additionalData: { metadata: { datasetMapping: { mappingType: "single", singleDataset: datasetId } } },
      triggerWorkflow: true,
    });

    const ingestJob = await waitForSchemaDetection(ingestFile.id);
    await simulateSchemaApproval(String(ingestJob!.id));

    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    const events = await payload.find({
      collection: "events",
      where: { dataset: { equals: datasetId } },
      sort: "eventTimestamp",
    });

    return events.docs as Event[];
  };

  // --- Test 1: All 6 transforms applied correctly ---

  it("should apply all transform types correctly through the import pipeline", async () => {
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `All Transforms Dataset ${Date.now()}`,
      language: "eng",
      schemaConfig: { allowTransformations: true },
      ingestTransforms: buildAllTransforms(),
      idStrategy: { type: "content-hash" },
    });

    const events = await runFullImport(dataset.id);
    expect(events).toHaveLength(3);

    // --- Verify first event: "Tech Conference" ---
    const firstData = getEventData(events[0]!);

    // rename: event_name -> title
    expect(firstData.title).toBe("Tech Conference");
    expect(firstData.event_name).toBeUndefined();

    // date-parse: DD/MM/YYYY -> YYYY-MM-DD
    expect(firstData.event_date).toBe("2024-03-15");

    // concatenate: venue_city + venue_country -> location (runs BEFORE uppercase)
    expect(firstData.location).toBe("Berlin, Germany");

    // string-op: uppercase venue_city (runs AFTER concatenate)
    expect(firstData.venue_city).toBe("BERLIN");

    // split: full_address by space -> 3 fields
    expect(firstData.street_name).toBe("Alexanderplatz");
    expect(firstData.street_number).toBe("1");
    expect(firstData.split_city).toBe("Berlin");

    // expression: attendees should be a number
    // Papa Parse with dynamicTyping may already parse "150" as number,
    // so the expression toNumber() may be a no-op.
    // Either way, the result must be the number 150.
    expect(typeof firstData.attendees).toBe("number");
    expect(firstData.attendees).toBe(150);

    // --- Verify second event: "Music Festival" ---
    const secondData = getEventData(events[1]!);

    expect(secondData.title).toBe("Music Festival");
    expect(secondData.event_name).toBeUndefined();
    expect(secondData.event_date).toBe("2024-04-20");
    expect(secondData.location).toBe("Munich, Germany");
    expect(secondData.venue_city).toBe("MUNICH");
    expect(secondData.street_name).toBe("Marienplatz");
    expect(secondData.street_number).toBe("5");
    expect(secondData.split_city).toBe("Munich");
    expect(typeof secondData.attendees).toBe("number");
    expect(secondData.attendees).toBe(2500);

    // --- Verify third event: "Workshop" ---
    const thirdData = getEventData(events[2]!);

    expect(thirdData.title).toBe("Workshop");
    expect(thirdData.event_name).toBeUndefined();
    expect(thirdData.event_date).toBe("2024-05-10");
    expect(thirdData.location).toBe("Hamburg, Germany");
    expect(thirdData.venue_city).toBe("HAMBURG");
    expect(thirdData.street_name).toBe("Jungfernstieg");
    expect(thirdData.street_number).toBe("10");
    expect(thirdData.split_city).toBe("Hamburg");
    expect(typeof thirdData.attendees).toBe("number");
    expect(thirdData.attendees).toBe(45);
  });

  // --- Test 2: Inactive transform is skipped ---

  it("should skip inactive transforms while applying active ones", async () => {
    const uid = Math.random().toString(36).slice(2, 8);
    const transforms = [
      ...buildAllTransforms(),
      // 7th transform: lowercase venue_country, but INACTIVE
      {
        id: `t-lower-inactive-${uid}`,
        type: "string-op",
        from: "venue_country",
        operation: "lowercase",
        active: false,
        autoDetected: false,
      },
    ];

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Inactive Transform Dataset ${Date.now()}`,
      language: "eng",
      schemaConfig: { allowTransformations: true },
      ingestTransforms: transforms,
      idStrategy: { type: "content-hash" },
    });

    const events = await runFullImport(dataset.id);
    expect(events).toHaveLength(3);

    const firstData = getEventData(events[0]!);

    // The inactive lowercase transform should NOT have been applied
    // venue_country should remain "Germany" (not "germany")
    expect(firstData.venue_country).toBe("Germany");

    // Active transforms should still have been applied
    expect(firstData.title).toBe("Tech Conference");
    expect(firstData.venue_city).toBe("BERLIN");
    expect(firstData.location).toBe("Berlin, Germany");
  });

  // --- Test 3: Transform order verification ---

  it("should apply concatenate before string-op uppercase so location has original case", async () => {
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Order Verification Dataset ${Date.now()}`,
      language: "eng",
      schemaConfig: { allowTransformations: true },
      ingestTransforms: buildAllTransforms(),
      idStrategy: { type: "content-hash" },
    });

    const events = await runFullImport(dataset.id);
    expect(events).toHaveLength(3);

    // Concatenate (position 3) runs BEFORE string-op uppercase (position 4).
    // Therefore "location" should contain the original-case city name,
    // while "venue_city" should be uppercased.
    for (const event of events) {
      const data = getEventData(event);

      // location was built from pre-uppercase venue_city
      const locationStr = String(data.location);
      expect(locationStr).not.toMatch(/^[A-Z]+,/);

      // venue_city was uppercased after concatenation
      const cityStr = String(data.venue_city);
      expect(cityStr).toBe(cityStr.toUpperCase());
    }

    // Explicit check on all three events
    expect(getEventData(events[0]!).location).toBe("Berlin, Germany");
    expect(getEventData(events[0]!).venue_city).toBe("BERLIN");

    expect(getEventData(events[1]!).location).toBe("Munich, Germany");
    expect(getEventData(events[1]!).venue_city).toBe("MUNICH");

    expect(getEventData(events[2]!).location).toBe("Hamburg, Germany");
    expect(getEventData(events[2]!).venue_city).toBe("HAMBURG");
  });
});
