/**
 * Integration test for geocode-batch progress reporting.
 *
 * Regression coverage for GitHub issue #104: the geocode-batch stage must
 * report progress in units of unique locations, not raw file rows. A file
 * with many repeated addresses geocodes only the unique set, so a progress
 * total pinned to the row count would jump or stall relative to actual work.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as geocodingModule from "@/lib/services/geocoding";

import {
  createIntegrationTestEnvironment,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/** Mock batchGeocode where every address succeeds with the same coordinates. */
const createAllSuccessBatchGeocode = () =>
  vi.fn().mockImplementation((addresses: string[]) => {
    const results = new Map<string, unknown>();
    for (const address of addresses) {
      results.set(address, {
        latitude: 52.52,
        longitude: 13.405,
        normalizedAddress: address,
        confidence: 0.9,
        provider: "mock",
        components: {},
        metadata: {},
      });
    }
    return { results, summary: { total: addresses.length, successful: addresses.length, failed: 0, cached: 0 } };
  });

describe.sequential("Geocode Batch Job - Progress Reporting", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string | number;

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
    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      isEnabled: () => Promise.resolve(true),
      batchGeocode: createAllSuccessBatchGeocode(),
    } as unknown as geocodingModule.GeocodingService);

    await testEnv.seedManager.truncate([
      "users",
      "catalogs",
      "datasets",
      "dataset-schemas",
      "events",
      "ingest-files",
      "ingest-jobs",
      "payload-jobs",
    ]);

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    testUserId = users.testUser.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Test Catalog",
      description: "Catalog for testing geocode progress reporting",
      user: users.testUser,
    });
    testCatalogId = catalog.id;
  });

  it("reports rowsTotal and rowsProcessed as the unique location count, not the row count", async () => {
    const ROW_COUNT = 9500;
    const UNIQUE_LOCATIONS = 40;
    const rows = Array.from(
      { length: ROW_COUNT },
      (_, i) => `Event ${i},2024-01-0${(i % 9) + 1},Location ${i % UNIQUE_LOCATIONS}`
    );
    const csvContent = `name,date,location\n${rows.join("\n")}\n`;

    await withDataset(testEnv, testCatalogId, {
      name: "geocode-progress-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-progress-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: { originalName: "geocode-progress-test.csv" },
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) => ingestJob.stage === "failed" || ingestJob.stage === "completed",
      { maxIterations: 100 }
    );

    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });

    expect(importJobs.docs).toHaveLength(1);
    const ingestJob = importJobs.docs[0];
    expect(ingestJob.stage).toBe("completed");

    const geocodeStage = ingestJob.progress.stages["geocode-batch"];
    expect(geocodeStage.status).toBe("completed");
    // Not ROW_COUNT (9500) — the stage total must track unique locations.
    expect(geocodeStage.rowsTotal).toBe(UNIQUE_LOCATIONS);
    expect(geocodeStage.rowsProcessed).toBe(UNIQUE_LOCATIONS);

    expect(Object.keys(ingestJob.geocodingResults)).toHaveLength(UNIQUE_LOCATIONS);
  });
});
