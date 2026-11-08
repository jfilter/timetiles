/**
 * Integration tests for ingest runs: transactional dispatch and run reconciliation
 * with the source bookkeeping it performs exactly once.
 *
 * @module
 * @category Tests
 */
import { eq } from "@payloadcms/db-postgres/drizzle";
import { createLocalReq, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/ingest-constants";
import {
  dispatchIngestRun,
  hasScheduledRunAwaitingReview,
  hasUnsettledScheduledRun,
  queueIngestProcess,
} from "@/lib/ingest/ingest-runs";
import { reconcileIngestRunsJob } from "@/lib/jobs/handlers/reconcile-ingest-runs-job";
import { reconcileRun } from "@/lib/jobs/utils/reconcile-run";
import { ingest_jobs } from "@/payload-generated-schema";
import type { Catalog, Dataset, User } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withScheduledIngest,
  withUsers,
} from "../../setup/integration/environment";

describe("Ingest runs", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let user: User;
  let catalog: Catalog;
  let dataset: Dataset;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
    ({
      users: { user },
    } = await withUsers(testEnv, { user: { role: "admin", trustLevel: "5" } }));
    ({ catalog } = await withCatalog(testEnv, { name: "Ingest Runs Catalog", user }));
    ({ dataset } = await withDataset(testEnv, catalog.id, { name: "Ingest Runs Dataset" }));
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  /** A file with one IngestJob per sheet, optionally fetched by a schedule. */
  const createFileWithSheets = async (sheetCount: number, scheduledIngestId?: number) => {
    const { ingestFile } = await withIngestFile(testEnv, catalog.id, "title,date\nA,2024-01-01\n", {
      user: user.id,
      status: "processing",
      additionalData: scheduledIngestId ? { scheduledIngest: scheduledIngestId } : {},
    });
    const jobIds: number[] = [];
    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
      const job = await payload.create({
        collection: "ingest-jobs",
        data: {
          ingestFile: ingestFile.id,
          dataset: dataset.id,
          sheetIndex,
          stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        },
        overrideAccess: true,
      });
      jobIds.push(job.id);
    }
    return { ingestFileId: ingestFile.id as number, jobIds };
  };

  /** Move a sheet to a stage without running its pipeline. */
  const setStage = async (ingestJobId: number, stage: ProcessingStage, reviewReason?: string) => {
    await payload.db.drizzle
      .update(ingest_jobs)
      .set({ stage, ...(reviewReason ? { reviewReason } : {}) })
      .where(eq(ingest_jobs.id, ingestJobId));
  };

  const childJobs = (ingestJobIds: number[]) =>
    payload.find({
      collection: "payload-jobs",
      where: { workflowSlug: { equals: "ingest-process" }, "input.ingestJobId": { in: ingestJobIds.map(String) } },
      pagination: false,
    });

  const loadRun = (runId: number) => payload.findByID({ collection: "ingest-runs", id: runId, depth: 0 });

  const createRunningSchedule = async () => {
    const { scheduledIngest } = await withScheduledIngest(testEnv, catalog.id, "https://example.com/feed.csv", {
      user,
      frequency: "daily",
      additionalData: { lastStatus: "running", lastRun: new Date().toISOString(), currentRetries: 0 },
    });
    return scheduledIngest as { id: number };
  };

  const loadSchedule = (id: number) => payload.findByID({ collection: "scheduled-ingests", id, depth: 0 });

  describe("dispatch", () => {
    it("queues one child per sheet once, also when the dispatch is delivered again", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(2);
      const args = { ingestFileId, ingestJobIds: jobIds, source: "manual" as const };

      const first = await dispatchIngestRun(payload, args);
      const second = await dispatchIngestRun(payload, args);

      expect(first.dispatched).toBe(true);
      expect(second).toEqual({ runId: first.runId, dispatched: false });
      const children = await childJobs(jobIds);
      expect(children.docs).toHaveLength(2);
      expect(children.docs.map((child) => (child.input as { generation: number }).generation)).toEqual([1, 1]);
      const run = await loadRun(first.runId);
      expect(run.expectedSheets).toBe(2);
      expect(run.dispatchedAt).toBeTruthy();
    });

    it("serializes concurrent dispatchers of the same file", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(3);
      const args = { ingestFileId, ingestJobIds: jobIds, source: "manual" as const };

      const results = await Promise.all([dispatchIngestRun(payload, args), dispatchIngestRun(payload, args)]);

      expect(results.filter((result) => result.dispatched)).toHaveLength(1);
      expect((await childJobs(jobIds)).docs).toHaveLength(3);
    });
  });

  describe("reconciliation", () => {
    it("keeps a run open while a sheet is in flight and settles each sheet independently", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(2);
      const { runId } = await dispatchIngestRun(payload, { ingestFileId, ingestJobIds: jobIds, source: "manual" });

      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);
      expect(await reconcileRun(payload, runId)).toBe("pending");

      await setStage(jobIds[1]!, PROCESSING_STAGE.FAILED);
      expect(await reconcileRun(payload, runId)).toBe("failed");

      const file = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
      expect(file.status).toBe("failed");
      const completed = await payload.findByID({ collection: "ingest-jobs", id: jobIds[0]! });
      expect(completed.stage).toBe(PROCESSING_STAGE.COMPLETED);
    });

    it("counts a failed scheduled run once, however often and for however many sheets it reconciles", async () => {
      const schedule = await createRunningSchedule();
      const { ingestFileId, jobIds } = await createFileWithSheets(2, schedule.id);
      const { runId } = await dispatchIngestRun(payload, {
        ingestFileId,
        ingestJobIds: jobIds,
        source: "scheduled",
        scheduledIngestId: schedule.id,
      });
      expect(await hasUnsettledScheduledRun(payload, schedule.id)).toBe(true);

      await setStage(jobIds[0]!, PROCESSING_STAGE.FAILED);
      await setStage(jobIds[1]!, PROCESSING_STAGE.NEEDS_REVIEW, "schema-drift");
      await reconcileRun(payload, runId);
      await reconcileRun(payload, runId);

      const updated = await loadSchedule(schedule.id);
      expect(updated.lastStatus).toBe("failed");
      expect(updated.currentRetries).toBe(1);
      expect(updated.executionHistory).toHaveLength(1);
      expect(updated.executionHistory?.[0]).toMatchObject({ status: "failed", jobId: String(ingestFileId) });
      expect((await loadRun(runId)).accountedAt).toBeTruthy();
      expect(await hasUnsettledScheduledRun(payload, schedule.id)).toBe(false);
      // The sheet still in review keeps the feed halted although the run failed.
      expect(await hasScheduledRunAwaitingReview(payload, schedule.id)).toBe(true);
    });

    it("keeps the bookkeeping of two runs of one schedule that settle at the same time", async () => {
      const schedule = await createRunningSchedule();
      const runs = [];
      for (let index = 0; index < 2; index++) {
        const { ingestFileId, jobIds } = await createFileWithSheets(1, schedule.id);
        const { runId } = await dispatchIngestRun(payload, {
          ingestFileId,
          ingestJobIds: jobIds,
          source: "scheduled",
          scheduledIngestId: schedule.id,
        });
        await setStage(jobIds[0]!, PROCESSING_STAGE.FAILED);
        runs.push(runId);
      }

      await Promise.all(runs.map((runId) => reconcileRun(payload, runId)));

      const updated = await loadSchedule(schedule.id);
      expect(updated.currentRetries).toBe(2);
      expect(updated.executionHistory).toHaveLength(2);
      expect(updated.statistics?.failedRuns).toBe(2);
    });

    it("halts the feed during a review and counts the run once it resolves", async () => {
      const schedule = await createRunningSchedule();
      await payload.update({ collection: "scheduled-ingests", id: schedule.id, data: { currentRetries: 2 } });
      const { ingestFileId, jobIds } = await createFileWithSheets(2, schedule.id);
      const { runId } = await dispatchIngestRun(payload, {
        ingestFileId,
        ingestJobIds: jobIds,
        source: "scheduled",
        scheduledIngestId: schedule.id,
      });

      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);
      await setStage(jobIds[1]!, PROCESSING_STAGE.NEEDS_REVIEW, "schema-drift");
      expect(await reconcileRun(payload, runId)).toBe("awaiting_review");

      const paused = await loadSchedule(schedule.id);
      expect(paused.lastStatus).toBe("paused");
      expect(paused.currentRetries).toBe(2);
      expect(paused.lastError).toContain("schema-drift");
      expect(await hasScheduledRunAwaitingReview(payload, schedule.id)).toBe(true);

      // An approved resumption in flight keeps the run awaiting review.
      await setStage(jobIds[1]!, PROCESSING_STAGE.CREATE_EVENTS);
      expect(await reconcileRun(payload, runId)).toBe("awaiting_review");

      await setStage(jobIds[1]!, PROCESSING_STAGE.COMPLETED);
      expect(await reconcileRun(payload, runId)).toBe("completed");

      const resolved = await loadSchedule(schedule.id);
      expect(resolved.lastStatus).toBe("success");
      expect(resolved.executionHistory).toHaveLength(1);
      expect(resolved.executionHistory?.[0]).toMatchObject({ status: "success", jobId: String(ingestFileId) });
      // The pause counted nothing; the resolved run counts once and resets the retry budget.
      expect(resolved.currentRetries).toBe(0);
      expect(resolved.statistics?.successfulRuns).toBe((paused.statistics?.successfulRuns ?? 0) + 1);
      expect(await reconcileRun(payload, runId)).toBe("completed");
      const again = await loadSchedule(schedule.id);
      expect(again.statistics?.successfulRuns).toBe(resolved.statistics?.successfulRuns);
      expect(await hasScheduledRunAwaitingReview(payload, schedule.id)).toBe(false);
      const file = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
      expect(file.status).toBe("completed");
    });

    it("does not overwrite a newer run's status when an older review resolves", async () => {
      const schedule = await createRunningSchedule();
      const { ingestFileId, jobIds } = await createFileWithSheets(1, schedule.id);
      const { runId } = await dispatchIngestRun(payload, {
        ingestFileId,
        ingestJobIds: jobIds,
        source: "scheduled",
        scheduledIngestId: schedule.id,
      });
      await setStage(jobIds[0]!, PROCESSING_STAGE.NEEDS_REVIEW, "schema-drift");
      await reconcileRun(payload, runId);

      const paused = await loadSchedule(schedule.id);
      await payload.update({
        collection: "scheduled-ingests",
        id: schedule.id,
        data: {
          lastStatus: "running",
          executionHistory: [
            { executedAt: new Date().toISOString(), status: "success" },
            ...(paused.executionHistory ?? []),
          ],
        },
      });

      await setStage(jobIds[0]!, PROCESSING_STAGE.FAILED);
      expect(await reconcileRun(payload, runId)).toBe("failed");

      const updated = await loadSchedule(schedule.id);
      expect(updated.lastStatus).toBe("running");
      expect(updated.currentRetries).toBe(1);
      expect(updated.executionHistory).toHaveLength(2);
      expect(updated.executionHistory?.[1]).toMatchObject({ status: "failed", jobId: String(ingestFileId) });
    });

    it("keeps a newer run's claim when an older review resolves before that run settles", async () => {
      const schedule = await createRunningSchedule();
      const { ingestFileId, jobIds } = await createFileWithSheets(1, schedule.id);
      const { runId } = await dispatchIngestRun(payload, {
        ingestFileId,
        ingestJobIds: jobIds,
        source: "scheduled",
        scheduledIngestId: schedule.id,
      });
      await setStage(jobIds[0]!, PROCESSING_STAGE.NEEDS_REVIEW, "schema-drift");
      await reconcileRun(payload, runId);
      // A newer run claims the schedule; it has no history entry until it settles.
      await payload.update({ collection: "scheduled-ingests", id: schedule.id, data: { lastStatus: "running" } });

      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);
      expect(await reconcileRun(payload, runId)).toBe("completed");

      const updated = await loadSchedule(schedule.id);
      expect(updated.lastStatus).toBe("running");
      expect(updated.executionHistory?.[0]).toMatchObject({ status: "success", jobId: String(ingestFileId) });
    });

    it("counts a run that failed after a review once and only amends a later retry", async () => {
      const schedule = await createRunningSchedule();
      const { ingestFileId, jobIds } = await createFileWithSheets(1, schedule.id);
      const { runId } = await dispatchIngestRun(payload, {
        ingestFileId,
        ingestJobIds: jobIds,
        source: "scheduled",
        scheduledIngestId: schedule.id,
      });
      await setStage(jobIds[0]!, PROCESSING_STAGE.NEEDS_REVIEW, "schema-drift");
      await reconcileRun(payload, runId);

      await setStage(jobIds[0]!, PROCESSING_STAGE.FAILED);
      expect(await reconcileRun(payload, runId)).toBe("failed");
      const failed = await loadSchedule(schedule.id);
      expect(failed.lastStatus).toBe("failed");
      expect(failed.currentRetries).toBe(1);
      expect(failed.executionHistory).toHaveLength(1);
      expect(failed.statistics?.failedRuns).toBe(1);

      // A retried sheet that completes amends the counted run without counting it again.
      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);
      expect(await reconcileRun(payload, runId)).toBe("completed");
      const retried = await loadSchedule(schedule.id);
      expect(retried.lastStatus).toBe("success");
      expect(retried.currentRetries).toBe(1);
      expect(retried.statistics).toMatchObject({
        failedRuns: 1,
        successfulRuns: failed.statistics?.successfulRuns ?? 0,
      });
      expect(retried.executionHistory).toHaveLength(1);
    });

    it("settles a run as failed when a sheet is deleted after dispatch", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(2);
      const { runId } = await dispatchIngestRun(payload, { ingestFileId, ingestJobIds: jobIds, source: "manual" });
      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);
      await payload.delete({ collection: "ingest-jobs", id: jobIds[1]!, overrideAccess: true });

      expect(await reconcileRun(payload, runId)).toBe("failed");
    });

    it("records the outcome on the scraper run that produced the file", async () => {
      const repo = await payload.create({
        collection: "scraper-repos",
        data: {
          name: "Ingest Runs Repo",
          sourceType: "upload",
          code: { "scrapers.yml": "scrapers: []" },
          createdBy: user.id,
        },
        overrideAccess: true,
      });
      const scraper = await payload.create({
        collection: "scrapers",
        data: {
          name: "Ingest Runs Scraper",
          slug: "ingest-runs-scraper",
          repo: repo.id,
          runtime: "python",
          entrypoint: "scraper.py",
          outputFile: "data.csv",
        },
        overrideAccess: true,
      });
      const scraperRun = await payload.create({
        collection: "scraper-runs",
        data: { scraper: scraper.id, status: "success", triggeredBy: "manual" },
        overrideAccess: true,
      });
      const { ingestFileId, jobIds } = await createFileWithSheets(1);
      const { runId } = await dispatchIngestRun(payload, {
        ingestFileId,
        ingestJobIds: jobIds,
        source: "scraper",
        scraperRunId: scraperRun.id,
      });

      await setStage(jobIds[0]!, PROCESSING_STAGE.FAILED);
      await reconcileRun(payload, runId);

      const updated = await payload.findByID({ collection: "scraper-runs", id: scraperRun.id, overrideAccess: true });
      expect(updated.importOutcome).toBe("failed");
    });

    it("resumes an approved review as a new generation", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(1);
      const { runId } = await dispatchIngestRun(payload, { ingestFileId, ingestJobIds: jobIds, source: "manual" });
      await setStage(jobIds[0]!, PROCESSING_STAGE.NEEDS_REVIEW, "schema-drift");
      expect(await reconcileRun(payload, runId)).toBe("awaiting_review");

      await payload.update({
        collection: "ingest-jobs",
        id: jobIds[0]!,
        data: { schemaValidation: { approved: true } },
        user,
        overrideAccess: true,
      });

      expect((await payload.findByID({ collection: "ingest-jobs", id: jobIds[0]! })).generation).toBe(2);
      const inputs = (await childJobs(jobIds)).docs.map((child) => child.input as Record<string, unknown>);
      expect(inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ generation: 1 }),
          expect.objectContaining({ generation: 2, resumeFrom: "create-schema-version" }),
        ])
      );
      expect(inputs).toHaveLength(2);
    });

    it("reopens a failed run when a sheet is retried, so the periodic task settles the retry", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(1);
      const { runId } = await dispatchIngestRun(payload, { ingestFileId, ingestJobIds: jobIds, source: "manual" });
      await setStage(jobIds[0]!, PROCESSING_STAGE.FAILED);
      expect(await reconcileRun(payload, runId)).toBe("failed");

      await queueIngestProcess(await createLocalReq({}, payload), jobIds[0]!, "analyze-duplicates");
      expect((await loadRun(runId)).outcome).toBe("pending");

      // The retry completes, but its transition-time reconciliation never ran.
      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);
      await reconcileIngestRunsJob.handler({ req: { payload } });

      expect((await loadRun(runId)).outcome).toBe("completed");
      const file = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
      expect(file.status).toBe("completed");
    });

    it("settles runs without a workflow transition from the periodic task", async () => {
      const { ingestFileId, jobIds } = await createFileWithSheets(1);
      const { runId } = await dispatchIngestRun(payload, { ingestFileId, ingestJobIds: jobIds, source: "manual" });
      // An approval that completes a job directly queues no workflow.
      await setStage(jobIds[0]!, PROCESSING_STAGE.COMPLETED);

      await reconcileIngestRunsJob.handler({ req: { payload } });

      const run = await loadRun(runId);
      expect(run.outcome).toBe("completed");
      expect(run.accountedAt).toBeTruthy();
    });
  });
});
