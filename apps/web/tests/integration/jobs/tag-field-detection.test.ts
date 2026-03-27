/**
 * Integration test for tag field detection and fieldTypes on datasets.
 *
 * Verifies the full pipeline: CSV with JSON-stringified arrays →
 * parse-json-array transform → schema detection marks isTagField →
 * dataset.fieldTypes includes tags → events have native arrays in
 * transformedData.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as geocodingModule from "@/lib/services/geocoding";
import type { FieldTypeMap } from "@/lib/jobs/utils/event-creation-helpers";
import type { FieldStatistics } from "@/lib/types/schema-detection";

import {
  createIntegrationTestEnvironment,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/** Mock geocoding — return success for all addresses (geocoding is not the focus of this test). */
const createSuccessBatchGeocode = () =>
  vi.fn().mockImplementation((addresses: string[]) => {
    const results = new Map<string, unknown>();
    for (const addr of addresses) {
      results.set(addr, {
        latitude: 50.94,
        longitude: 6.96,
        normalizedAddress: addr,
        confidence: 0.8,
        provider: "mock",
        components: {},
        metadata: {},
      });
    }
    return { results, summary: { total: addresses.length, successful: addresses.length, failed: 0, cached: 0 } };
  });

describe.sequential("Tag Field Detection", () => {
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
      batchGeocode: createSuccessBatchGeocode(),
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
      name: "Tag Test Catalog",
      description: "Catalog for tag field detection tests",
      user: users.testUser,
    });
    testCatalogId = catalog.id;
  });

  it("should detect array fields as tags and set fieldTypes on dataset", async () => {
    // CSV where category is a JSON-stringified array (as produced by json-to-csv)
    const csvContent = `title,date,location,category
Event A,2024-06-01,Berlin,"[""Sport"",""Kultur""]"
Event B,2024-06-02,Munich,"[""Sport"",""Jugend""]"
Event C,2024-06-03,Hamburg,"[""Kultur"",""Musik""]"
Event D,2024-06-04,Cologne,"[""Sport"",""Musik"",""Kultur""]"
Event E,2024-06-05,Frankfurt,"[""Jugend"",""Musik""]"
`;

    // Create dataset WITH parse-json-array transform on category
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: "tag-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
      ingestTransforms: [
        { id: crypto.randomUUID(), type: "parse-json-array", active: true, autoDetected: false, from: "category" },
      ],
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "tag-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: {
        originalName: "tag-test.csv",
        processingOptions: {
          autoApproveSchema: true,
          reviewChecks: { skipDuplicateRateCheck: true, skipGeocodingCheck: true },
        },
      },
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) => ingestJob.stage === "failed" || ingestJob.stage === "completed",
      { maxIterations: 50 }
    );

    // Check ingest job completed
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(importJobs.docs).toHaveLength(1);
    expect(importJobs.docs[0].stage).toBe("completed");

    // Check events have native arrays in transformedData
    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } } });
    expect(events.docs.length).toBe(5);

    const firstEvent = events.docs[0];
    expect(Array.isArray(firstEvent.transformedData.category)).toBe(true);

    // Check dataset has fieldTypes with tags
    const updatedDataset = await payload.findByID({ collection: "datasets", id: dataset.id });

    const fieldTypes = updatedDataset.fieldTypes as FieldTypeMap | null;
    const fm = updatedDataset.fieldMetadata as Record<string, FieldStatistics> | null;
    expect(fieldTypes).toBeDefined();
    expect(fieldTypes?.tags).toContain("category");

    // Check fieldMetadata marks category as tag field
    expect(fm?.category?.isTagField).toBe(true);
    expect(fm?.category?.typeDistribution?.array).toBeGreaterThan(0);
  });

  it("should extract IDs from URLs using extract transform", async () => {
    const csvContent = `title,date,link
Event A,2024-06-01,http://example.com/events/123/show
Event B,2024-06-02,http://example.com/events/456/show
Event C,2024-06-03,http://example.com/events/789/show
`;

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: "extract-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
      idStrategy: { type: "external", externalIdPath: "eventId", duplicateStrategy: "update" },
      ingestTransforms: [
        {
          id: crypto.randomUUID(),
          type: "extract",
          active: true,
          autoDetected: false,
          from: "link",
          to: "eventId",
          pattern: "/events/(\\d+)/",
        },
      ],
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "extract-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: {
        originalName: "extract-test.csv",
        processingOptions: {
          autoApproveSchema: true,
          reviewChecks: {
            skipDuplicateRateCheck: true,
            skipGeocodingCheck: true,
            skipTimestampCheck: true,
            skipLocationCheck: true,
            skipEmptyRowCheck: true,
            skipRowErrorCheck: true,
          },
        },
      },
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) => ingestJob.stage === "failed" || ingestJob.stage === "completed",
      { maxIterations: 50 }
    );

    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(importJobs.docs[0].stage).toBe("completed");

    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } } });
    expect(events.docs).toHaveLength(3);

    // Check that eventId was extracted from the URL
    const ids = events.docs.map((e: any) => e.transformedData?.eventId).sort();
    expect(ids).toEqual(["123", "456", "789"]);

    // Check that the original link is preserved
    expect(events.docs[0].transformedData?.link).toContain("http://example.com/events/");
  });

  it("should detect scalar enum fields and set fieldTypes.enum", async () => {
    // CSV with a low-cardinality scalar field
    const csvContent = `title,date,status
Event A,2024-06-01,open
Event B,2024-06-02,closed
Event C,2024-06-03,open
Event D,2024-06-04,in-progress
Event E,2024-06-05,open
Event F,2024-06-06,closed
`;

    await withDataset(testEnv, testCatalogId, {
      name: "enum-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "enum-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: {
        originalName: "enum-test.csv",
        processingOptions: {
          autoApproveSchema: true,
          reviewChecks: {
            skipDuplicateRateCheck: true,
            skipGeocodingCheck: true,
            skipTimestampCheck: true,
            skipLocationCheck: true,
            skipEmptyRowCheck: true,
            skipRowErrorCheck: true,
          },
        },
      },
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) => ingestJob.stage === "failed" || ingestJob.stage === "completed",
      { maxIterations: 50 }
    );

    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(importJobs.docs[0].stage).toBe("completed");

    // Check dataset fieldTypes has enum
    const datasets = await payload.find({ collection: "datasets", where: { name: { equals: "enum-test.csv" } } });
    const ds = datasets.docs[0];
    const fieldTypes = ds.fieldTypes as FieldTypeMap | null;
    expect(fieldTypes?.enum).toContain("status");

    const fm = ds.fieldMetadata as Record<string, FieldStatistics> | null;
    expect(fm?.status?.isEnumCandidate).toBe(true);
  });
});
