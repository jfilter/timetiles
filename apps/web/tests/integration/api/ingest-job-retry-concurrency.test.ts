// @vitest-environment node
/**
 * Concurrency and rollback regressions for ingest-job recovery endpoints.
 *
 * Two concurrent recoveries of the same FAILED job must not both queue a
 * workflow — the stage check and the enqueue must be atomic.
 *
 * @module
 */

import { sql } from "@payloadcms/db-postgres";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Isolate the concurrency race from the endpoint's own rate limiting (burst
// limit of 1/min would otherwise 429 the second concurrent call regardless).
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST as approvePOST } from "@/app/api/ingest-jobs/[id]/approve/route";
import { POST as resetPOST } from "@/app/api/ingest-jobs/[id]/reset/route";
import { POST as retryPOST } from "@/app/api/ingest-jobs/[id]/retry/route";
import { getEnv } from "@/lib/config/env";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { Catalog, Dataset, IngestFile, User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Ingest job recovery — concurrency and rollback", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;
  let owner: User;
  let admin: User;
  let catalog: Catalog;
  let dataset: Dataset;
  let ingestFile: IngestFile;

  const callRetry = async (id: number, token: string) => {
    const request = new NextRequest(`http://localhost:3000/api/ingest-jobs/${id}/retry`, {
      method: "POST",
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    return retryPOST(request, { params: Promise.resolve({ id: String(id) }) });
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      owner: { role: "user", _verified: true, trustLevel: "5" },
      admin: { role: "admin", _verified: true },
    });
    owner = users.owner;
    admin = users.admin;

    const catResult = await withCatalog(testEnv, { name: "Retry Catalog", isPublic: false, user: owner });
    catalog = catResult.catalog;

    const dsResult = await withDataset(testEnv, catalog.id, { name: "Retry Dataset", isPublic: false });
    dataset = dsResult.dataset;

    const ifResult = await withIngestFile(testEnv, catalog.id, "name,location\nEvent,Berlin", {
      user: owner.id,
      status: "failed",
    });
    ingestFile = ifResult.ingestFile;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it.each([
    ["approve", approvePOST],
    ["reset", resetPOST],
    ["retry", retryPOST],
  ] as const)("rejects invalid IDs at the %s route boundary", async (action, handler) => {
    const login = await payload.login({
      collection: "users",
      data: { email: admin.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    for (const id of ["not-a-number", "9007199254740993", "9".repeat(400)]) {
      const response = await handler(
        new NextRequest(`http://localhost:3000/api/ingest-jobs/${id}/${action}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${login.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(action === "reset" ? { targetStage: PROCESSING_STAGE.ANALYZE_DUPLICATES } : {}),
        }),
        { params: Promise.resolve({ id }) }
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        details: expect.arrayContaining([expect.objectContaining({ path: ["id"] })]),
      });
    }
  });

  const callReset = async (id: number, token: string) =>
    resetPOST(
      new NextRequest(`http://localhost:3000/api/ingest-jobs/${id}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetStage: PROCESSING_STAGE.ANALYZE_DUPLICATES, clearRetries: true }),
      }),
      { params: Promise.resolve({ id: String(id) }) }
    );

  it.each(["reset", "retry"])("protects the source file from cleanup after %s", async (operation) => {
    const { ingestFile: source } = await withIngestFile(testEnv, catalog.id, "name\nRetry source\n", {
      user: owner.id,
      status: "failed",
    });
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: source.id, dataset: dataset.id, stage: PROCESSING_STAGE.FAILED },
    });
    const old = new Date(Date.now() - (getEnv().INGEST_FILE_RETENTION_HOURS + 1) * 60 * 60 * 1000);
    await payload.db.drizzle.execute(sql`UPDATE payload.ingest_files SET updated_at = ${old.toISOString()}
      WHERE id = ${source.id}`);
    const login = await payload.login({
      collection: "users",
      data: { email: admin.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    const recover = operation === "reset" ? callReset : callRetry;
    expect((await recover(job.id, login.token)).status).toBe(200);
    const cleanupJob = await payload.jobs.queue({ task: "ingest-files-cleanup", queue: "maintenance", input: {} });
    await payload.jobs.run({ queue: "maintenance", where: { id: { equals: cleanupJob.id } } });
    const after = await payload.findByID({ collection: "ingest-files", id: source.id });
    expect(after.filename).toBe(source.filename);
    expect(after.status).toBe("processing");
  });

  it.each(["reset", "retry"])("rejects %s after the source file was reclaimed", async (operation) => {
    const { ingestFile: source } = await withIngestFile(testEnv, catalog.id, "name\nReclaimed source\n", {
      user: owner.id,
      status: "failed",
    });
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: source.id, dataset: dataset.id, stage: PROCESSING_STAGE.FAILED },
    });
    await payload.update({ collection: "ingest-files", id: source.id, data: { filename: null } });
    const login = await payload.login({
      collection: "users",
      data: { email: admin.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    const recover = operation === "reset" ? callReset : callRetry;
    expect((await recover(job.id, login.token)).status).toBe(400);
    expect((await payload.findByID({ collection: "ingest-jobs", id: job.id })).stage).toBe(PROCESSING_STAGE.FAILED);
    expect(
      (await payload.count({ collection: "payload-jobs", where: { "input.ingestJobId": { equals: String(job.id) } } }))
        .totalDocs
    ).toBe(0);
  });

  it.each(["reset", "retry"])("queues only one workflow for an admin reset concurrent with %s", async (operation) => {
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.FAILED },
    });
    const login = await payload.login({
      collection: "users",
      data: { email: admin.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    const second = operation === "reset" ? callReset : callRetry;
    const responses = await Promise.all([callReset(job.id, login.token), second(job.id, login.token)]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 400]);
    const queued = await payload.count({
      collection: "payload-jobs",
      where: { workflowSlug: { equals: "ingest-process" }, "input.ingestJobId": { equals: String(job.id) } },
    });
    expect(queued.totalDocs).toBe(1);
  });

  it.each(["reset", "retry"])(
    "preserves failed state when queueing %s is rejected by the database",
    async (operation) => {
      const errorLog = { message: "Original ingest failure" };
      const job = await payload.create({
        collection: "ingest-jobs",
        data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.FAILED, errorLog },
      });
      const login = await payload.login({
        collection: "users",
        data: { email: admin.email, password: TEST_CREDENTIALS.basic.strongPassword },
      });
      const fileBefore = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
      // Real database failure, scoped to this disposable worker database and removed in finally.
      await payload.db.drizzle.execute(sql`ALTER TABLE payload.payload_jobs ADD CONSTRAINT reject_reset_test
      CHECK (workflow_slug <> 'ingest-process') NOT VALID`);
      try {
        const recover = operation === "reset" ? callReset : callRetry;
        expect((await recover(job.id, login.token)).status).toBe(500);
        const after = await payload.findByID({ collection: "ingest-jobs", id: job.id });
        expect(after.stage).toBe(PROCESSING_STAGE.FAILED);
        expect(after.errorLog).toEqual(errorLog);
        expect(after.updatedAt).toBe(job.updatedAt);
        const fileAfter = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
        expect(fileAfter.status).toBe(fileBefore.status);
        expect(fileAfter.completedAt).toBe(fileBefore.completedAt);
        expect(fileAfter.updatedAt).toBe(fileBefore.updatedAt);
        const queued = await payload.count({
          collection: "payload-jobs",
          where: { "input.ingestJobId": { equals: String(job.id) } },
        });
        expect(queued.totalDocs).toBe(0);
      } finally {
        await payload.db.drizzle.execute(sql`ALTER TABLE payload.payload_jobs DROP CONSTRAINT reject_reset_test`);
      }
    }
  );

  it("queues the ingest-process workflow exactly once for two concurrent retries", async () => {
    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.FAILED },
      overrideAccess: true,
    });

    const login = await payload.login({
      collection: "users",
      data: { email: owner.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    const token = login.token as string;

    const [first, second] = await Promise.all([callRetry(ingestJob.id, token), callRetry(ingestJob.id, token)]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    // Exactly one succeeds; the other finds the job no longer FAILED.
    expect(statuses).toEqual([200, 400]);

    const queuedJobs = await payload.find({
      collection: "payload-jobs",
      where: {
        and: [
          { workflowSlug: { equals: "ingest-process" } },
          { "input.ingestJobId": { equals: String(ingestJob.id) } },
        ],
      },
      overrideAccess: true,
    });
    expect(queuedJobs.docs).toHaveLength(1);
  });
});
