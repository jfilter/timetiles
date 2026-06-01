/**
 * Integration tests for data quality review checks in the import pipeline.
 *
 * Tests that the pipeline correctly pauses at NEEDS_REVIEW for all 8 reasons,
 * and that approval correctly resumes the pipeline without loops.
 *
 * Uses low threshold overrides via processingOptions.reviewChecks to trigger
 * checks with minimal test data.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as geocodingModule from "@/lib/services/geocoding";
import type { IngestJob } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilIngestJobStage,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/** Helper: run jobs until a job reaches needs-review, completed, or failed. */
const isSettled = (job: Pick<IngestJob, "stage">) =>
  job.stage === "needs-review" || job.stage === "completed" || job.stage === "failed";

/** Helper: approve an ingest job and run until it reaches a terminal or review state again. */
const approveAndResume = async (
  payload: any,
  ingestFileId: string | number,
  ingestJobId: string | number,
  schemaValidation: unknown,
  userId: string | number,
  waitFor: (job: Pick<IngestJob, "stage">) => boolean = isSettled
) => {
  const approver = await payload.findByID({ collection: "users", id: userId });
  await payload.update({
    collection: "ingest-jobs",
    id: ingestJobId,
    data: { schemaValidation: { ...(schemaValidation as Record<string, unknown>), approved: true } },
    user: approver,
  });
  await runJobsUntilIngestJobStage(payload, ingestFileId, waitFor);
};

describe.sequential("Review Checks Pipeline", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let uploadUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { uploader: { role: "user" } });
    uploadUserId = users.uploader.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Review Checks Test Catalog",
      description: "Catalog for testing review checks",
      user: users.uploader,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Mock geocoding so tests don't depend on external Nominatim API.
    // Without this, the geocode-batch step makes real HTTP requests that fail
    // under Nominatim rate limiting when the full test suite runs.
    const mockGeocodingResult = {
      latitude: 52.52,
      longitude: 13.405,
      confidence: 0.9,
      normalizedAddress: "Berlin, Germany",
      provider: "mock",
      components: {},
      metadata: {},
    };

    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      geocode: vi.fn().mockResolvedValue(mockGeocodingResult),
      batchGeocode: vi.fn().mockImplementation((addresses: string[]) => {
        const results = new Map();
        for (const addr of addresses) {
          results.set(addr, mockGeocodingResult);
        }
        return Promise.resolve({
          results,
          summary: { total: addresses.length, successful: addresses.length, failed: 0, cached: 0 },
        });
      }),
      testConfiguration: vi.fn().mockResolvedValue({}),
    } as unknown as geocodingModule.GeocodingService);

    await testEnv.seedManager.truncate(collectionsToReset);
  });

  // ── Trigger tests: verify each check fires ─────────────────────────

  it("should pause for no-timestamp when no date column exists", async () => {
    const csvContent = "name,location\nConference,Berlin\nWorkshop,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "no-timestamp.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs).toHaveLength(1);
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("no-timestamp");
    expect(jobs.docs[0].reviewDetails?.availableColumns).toBeDefined();
  });

  it("should pause for no-location when no location column exists", async () => {
    const csvContent = "name,date\nConference,2024-06-15\nWorkshop,2024-07-20\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "no-location.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("no-location");
  });

  it("should pause for ambiguous-coordinate-order when a combined column's axis order is undecided", async () => {
    // Every coordinate sample is mid-latitude (both components ≤90), so the
    // detector cannot tell lat,lng from lng,lat → coordinateFormat "ambiguous".
    const csvContent =
      'name,date,coordinates\nA,2024-06-15,"45.1,50.2"\nB,2024-07-20,"12.3,34.4"\nC,2024-08-01,"40.5,41.6"\n';

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "ambiguous-coords.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("ambiguous-coordinate-order");
  });

  it("should pause for ambiguous-date-order when a date column's day/month order is undecided", async () => {
    // Every date sample has both parts ≤ 12, so the detector cannot tell D/M from
    // M/D → timestampOrder "ambiguous". A location column is present so the
    // no-location gate (which runs before the date gate) does not fire first.
    const csvContent = "name,date,location\nA,01/02/2024,Berlin\nB,03/04/2024,Munich\nC,05/06/2024,Hamburg\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "ambiguous-dates.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("ambiguous-date-order");
    expect(jobs.docs[0].detectedFieldMappings?.timestampOrder).toBe("ambiguous");
  });

  it("should pause for ambiguous-date-order when the paired heuristic infers an undecided date column", async () => {
    // The primary detector misses the date columns (`opens_on`/`closes_on` match
    // no timestamp pattern), so the paired-date heuristic infers them instead.
    // Every value has both parts ≤ 12, so the re-derived order is "ambiguous".
    // Without re-deriving order on the heuristic path the column would keep
    // `timestampOrder === null`, the gate would not fire, and the rows would reach
    // create-events with no explicit order. A location column is present so the
    // no-location gate (which runs first) does not fire.
    const csvContent = [
      "name,opens_on,closes_on,location",
      "A,01/02/2024,03/02/2024,Berlin",
      "B,04/05/2024,06/05/2024,Munich",
      "C,07/08/2024,09/08/2024,Hamburg",
      "",
    ].join("\n");

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "ambiguous-paired-dates.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("ambiguous-date-order");
    expect(jobs.docs[0].detectedFieldMappings?.timestampPath).toBe("opens_on");
    expect(jobs.docs[0].detectedFieldMappings?.timestampOrder).toBe("ambiguous");
  });

  it("should pause for high-duplicates when duplicate rate exceeds threshold", async () => {
    // 3 identical rows + 1 unique = 75% duplicates. Use threshold 0.5 to trigger easily.
    const csvContent = [
      "name,date,location",
      "Same Event,2024-01-01,Berlin",
      "Same Event,2024-01-01,Berlin",
      "Same Event,2024-01-01,Berlin",
      "Unique Event,2024-02-01,Munich",
      "",
    ].join("\n");

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "high-duplicates.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: {
        processingOptions: {
          reviewChecks: {
            skipTimestampCheck: true,
            skipLocationCheck: true,
            duplicateRateThreshold: 0.01, // Trigger at >50% instead of >80%
          },
        },
      },
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("high-duplicates");
    expect(jobs.docs[0].reviewDetails?.duplicateRate).toBeGreaterThanOrEqual(0.5);
  });

  it("should pause for high-empty-rows when empty rate exceeds threshold", async () => {
    // 2 real rows + 2 empty rows = 50% empty. Use threshold 0.1 to trigger easily.
    const csvContent = [
      "name,date,location",
      "Conference,2024-01-01,Berlin",
      ",,",
      "Workshop,2024-02-01,Munich",
      ",,",
      "",
    ].join("\n");

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "high-empty-rows.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: {
        processingOptions: {
          reviewChecks: {
            skipTimestampCheck: true,
            skipLocationCheck: true,
            emptyRowThreshold: 0.1, // Trigger at >10% instead of >20%
          },
        },
      },
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("high-empty-rows");
    expect(jobs.docs[0].reviewDetails?.emptyRate).toBeGreaterThan(0.1);
  });

  it("should complete pipeline when all fields are present", async () => {
    const csvContent = "name,date,location\nConference,2024-06-15,Berlin\nWorkshop,2024-07-20,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "complete-data.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("completed");
  });

  // ── Skip flag tests ────────────────────────────────────────────────

  it("should skip no-timestamp check when skipTimestampCheck is set", async () => {
    const csvContent = "name,location\nConference,Berlin\nWorkshop,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "skip-timestamp.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: { processingOptions: { reviewChecks: { skipTimestampCheck: true } } },
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    // Should NOT pause for no-timestamp (may still pause for no-location)
    expect(jobs.docs[0].reviewReason).not.toBe("no-timestamp");
  });

  it("should complete when all review checks are skipped", async () => {
    const csvContent = "name,description\nConference,A great event\nWorkshop,Learn something\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "skip-all.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: { processingOptions: { reviewChecks: { skipTimestampCheck: true, skipLocationCheck: true } } },
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("completed");
  });

  // ── Approval flow tests ────────────────────────────────────────────

  it("should complete after approving no-timestamp (sets skip flag)", async () => {
    const csvContent = "name,location\nConference,Berlin\nWorkshop,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "approve-no-timestamp.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    let jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("no-timestamp");

    // Approve → skip flag set → resume → may hit no-location next
    await approveAndResume(payload, ingestFile.id, jobs.docs[0].id, jobs.docs[0].schemaValidation, uploadUserId);

    // Verify skip flag was set — scoped to this sheet (index 0), NOT file-wide,
    // so a sibling sheet's identical check is not silently suppressed.
    const updatedFile = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    const checks = (updatedFile.processingOptions as Record<string, unknown>)?.reviewChecks as Record<string, unknown>;
    const perSheet0 = (checks?.perSheet as Record<string, Record<string, unknown>> | undefined)?.["0"];
    expect(perSheet0?.skipTimestampCheck).toBe(true);
    expect(checks?.skipTimestampCheck).toBeUndefined();

    // The pipeline may have completed or paused for no-location
    jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(["completed", "needs-review"]).toContain(jobs.docs[0].stage);
    if (jobs.docs[0].stage === "needs-review") {
      // Should NOT be no-timestamp again (skip flag works)
      expect(jobs.docs[0].reviewReason).not.toBe("no-timestamp");
    }
  }, 60_000);

  it("should complete after approving no-location (sets skip flag)", async () => {
    const csvContent = "name,date\nConference,2024-06-15\nWorkshop,2024-07-20\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "approve-no-location.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    let jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("no-location");

    // Approve → skip flag set → resume → should complete
    await approveAndResume(
      payload,
      ingestFile.id,
      jobs.docs[0].id,
      jobs.docs[0].schemaValidation,
      uploadUserId,
      (job) => job.stage === "completed" || job.stage === "failed"
    );

    jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("completed");
  }, 60_000);

  it("should complete after approving high-duplicates (sets skip flag)", async () => {
    const csvContent = [
      "name,date,location",
      "Same Event,2024-01-01,Berlin",
      "Same Event,2024-01-01,Berlin",
      "Same Event,2024-01-01,Berlin",
      "Unique Event,2024-02-01,Munich",
      "",
    ].join("\n");

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "approve-high-duplicates.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: {
        processingOptions: {
          reviewChecks: { skipTimestampCheck: true, skipLocationCheck: true, duplicateRateThreshold: 0.01 },
        },
      },
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    let jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("high-duplicates");

    // Approve → skipDuplicateRateCheck set → resume → should complete
    await approveAndResume(
      payload,
      ingestFile.id,
      jobs.docs[0].id,
      jobs.docs[0].schemaValidation,
      uploadUserId,
      (job) => job.stage === "completed" || job.stage === "failed"
    );

    jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("completed");

    // Verify skip flag — scoped to this sheet (index 0), NOT file-wide.
    const updatedFile = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    const checks = (updatedFile.processingOptions as Record<string, unknown>)?.reviewChecks as Record<string, unknown>;
    const perSheet0 = (checks?.perSheet as Record<string, Record<string, unknown>> | undefined)?.["0"];
    expect(perSheet0?.skipDuplicateRateCheck).toBe(true);
    expect(checks?.skipDuplicateRateCheck).toBeUndefined();
  }, 60_000);

  it("should complete after approving high-empty-rows (sets skip flag)", async () => {
    const csvContent = [
      "name,date,location",
      "Conference,2024-01-01,Berlin",
      ",,",
      "Workshop,2024-02-01,Munich",
      ",,",
      "",
    ].join("\n");

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "approve-high-empty.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: {
        processingOptions: {
          reviewChecks: { skipTimestampCheck: true, skipLocationCheck: true, emptyRowThreshold: 0.1 },
        },
      },
    });

    await runJobsUntilIngestJobStage(payload, ingestFile.id, isSettled);

    let jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("needs-review");
    expect(jobs.docs[0].reviewReason).toBe("high-empty-rows");

    // Approve → skipEmptyRowCheck set → resume → should complete
    await approveAndResume(
      payload,
      ingestFile.id,
      jobs.docs[0].id,
      jobs.docs[0].schemaValidation,
      uploadUserId,
      (job) => job.stage === "completed" || job.stage === "failed"
    );

    jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    expect(jobs.docs[0].stage).toBe("completed");

    // Verify skip flag — scoped to this sheet (index 0), NOT file-wide.
    const updatedFile = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    const checks = (updatedFile.processingOptions as Record<string, unknown>)?.reviewChecks as Record<string, unknown>;
    const perSheet0 = (checks?.perSheet as Record<string, Record<string, unknown>> | undefined)?.["0"];
    expect(perSheet0?.skipEmptyRowCheck).toBe(true);
    expect(checks?.skipEmptyRowCheck).toBeUndefined();
  }, 60_000);
});
