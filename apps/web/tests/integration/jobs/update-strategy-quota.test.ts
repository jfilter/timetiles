// @vitest-environment node
/**
 * Integration test for the TOTAL_EVENTS quota under the "update" duplicate
 * strategy.
 *
 * Regression: TOTAL_EVENTS is a lifetime count of events that EXIST. Under the
 * "update" strategy, external duplicates are written as in-place updates of
 * existing events, not new events — so they must NOT increase TOTAL_EVENTS.
 * Previously the reservation charged `uniqueRows` (which includes those
 * updates) and reconciliation compared against the DB count of events tagged
 * with this job (which also includes the updated events, since their ingestJob
 * is reassigned), so the over-reservation was never refunded. Repeated
 * scheduled re-imports therefore inflated the lifetime counter without bound.
 *
 * This drives the real quota service + DB through the two functions that own
 * reservation and reconciliation.
 *
 * @module
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkEventQuotaBeforeProcessing,
  markJobCompleted,
} from "@/lib/jobs/handlers/create-events-batch/job-completion";
import { type BulkEventData, bulkInsertEvents } from "@/lib/jobs/utils/bulk-event-insert";
import { createQuotaService } from "@/lib/services/quota-service";
import type { IngestFile, IngestJob, User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("TOTAL_EVENTS quota — update strategy", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  /** Build an update-strategy ingest job for a dataset with a persisted ingest-file. */
  const setup = async (
    summary: { totalRows: number; uniqueRows: number; internalDuplicates: number; externalDuplicates: number },
    user: User
  ): Promise<{ ingestFile: IngestFile; job: IngestJob; datasetId: number }> => {
    const { catalog } = await withCatalog(testEnv, { user });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: `Quota DS ${crypto.randomUUID().slice(0, 8)}` });

    // ingest-files is an upload collection — must go through the upload helper.
    const { ingestFile } = await withIngestFile(testEnv, catalog.id, "id,name\n1,a\n", {
      status: "processing",
      user: user.id,
    });

    const job = (await payload.create({
      collection: "ingest-jobs",
      data: {
        ingestFile: ingestFile.id,
        dataset: dataset.id,
        stage: "create-events",
        sheetIndex: 0,
        configSnapshot: { idStrategy: { duplicateStrategy: "update" } },
        duplicates: { strategy: "external", internal: [], external: [], summary },
      },
      overrideAccess: true,
    })) as unknown as IngestJob;

    // Re-read so relations are populated the way the handler sees them.
    const ingestFileFull = (await payload.findByID({
      collection: "ingest-files",
      id: ingestFile.id,
      overrideAccess: true,
    })) as unknown as IngestFile;

    return { ingestFile: ingestFileFull, job, datasetId: dataset.id };
  };

  /** Insert `count` events tagged with `jobId` via the real (hook-bypassing) bulk path. */
  const insertEventsForJob = async (datasetId: number, jobId: number, count: number): Promise<void> => {
    const events: BulkEventData[] = Array.from({ length: count }, (_, i) => ({
      dataset: datasetId,
      ingestJob: jobId,
      transformedData: { i },
      uniqueId: `${datasetId}:evt:${i}-${crypto.randomUUID().slice(0, 8)}`,
      eventTimestamp: new Date(2026, 0, 1 + i).toISOString(),
      coordinateSource: { type: "none" },
      validationStatus: "valid",
      datasetIsPublic: false,
    }));
    const { failures } = await bulkInsertEvents(payload, events);
    expect(failures).toEqual([]);
  };

  it("does not charge TOTAL_EVENTS for rows that only update existing events", async () => {
    const { users } = await withUsers(testEnv, {
      updater: { role: "editor", customQuotas: { maxTotalEvents: 1000, maxEventsPerImport: 1000 } },
    });
    const user = users.updater;
    const quotaService = createQuotaService(payload);

    // All 3 rows match existing events → 3 updates, 0 new events.
    const summary = { totalRows: 3, uniqueRows: 3, internalDuplicates: 0, externalDuplicates: 3 };
    const { ingestFile, job, datasetId } = await setup(summary, user);

    // Reservation: must reserve 0 (no new events), NOT uniqueRows (3).
    const reserved = await checkEventQuotaBeforeProcessing(payload, ingestFile, job);
    expect(reserved).toBe(0);

    const afterReserve = await quotaService.getCurrentUsage(user.id);
    expect(afterReserve?.totalEventsCreated ?? 0).toBe(0);

    // Simulate the update phase: the 3 existing events now carry this job's id
    // (as tryUpdateExistingEvent does). They must not be reconciled as "new".
    await insertEventsForJob(datasetId, job.id, 3);

    // Reconciliation with eventsUpdated=3 → 3 written − 3 updated = 0 new.
    const reconciledNewEvents = await markJobCompleted(payload, job.id, reserved, 3);
    expect(reconciledNewEvents).toBe(0);

    const afterReconcile = await quotaService.getCurrentUsage(user.id);
    expect(afterReconcile?.totalEventsCreated ?? 0).toBe(0);
  });

  it("charges TOTAL_EVENTS only for the genuinely-new rows in a mixed import", async () => {
    const { users } = await withUsers(testEnv, {
      mixer: { role: "editor", customQuotas: { maxTotalEvents: 1000, maxEventsPerImport: 1000 } },
    });
    const user = users.mixer;
    const quotaService = createQuotaService(payload);

    // 5 unique rows, 3 of them update existing events → 2 new events.
    const summary = { totalRows: 5, uniqueRows: 5, internalDuplicates: 0, externalDuplicates: 3 };
    const { ingestFile, job, datasetId } = await setup(summary, user);

    const reserved = await checkEventQuotaBeforeProcessing(payload, ingestFile, job);
    expect(reserved).toBe(2);

    // 5 events written for this job (2 created + 3 updated).
    await insertEventsForJob(datasetId, job.id, 5);

    const reconciledNewEvents = await markJobCompleted(payload, job.id, reserved, 3);
    expect(reconciledNewEvents).toBe(2);

    const afterReconcile = await quotaService.getCurrentUsage(user.id);
    expect(afterReconcile?.totalEventsCreated ?? 0).toBe(2);
  });
});
