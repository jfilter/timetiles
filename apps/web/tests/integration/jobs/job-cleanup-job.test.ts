/**
 * Verifies native retries for partial job cleanup failures.
 * @module
 * @category Tests
 */
import { sql } from "@payloadcms/db-postgres";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { jobCleanupJob } from "@/lib/jobs/handlers/job-cleanup-job";
import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("Job cleanup retries", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("does not let a full page of processing jobs hide removable jobs", async () => {
    const { payload } = env;
    const removable = await payload.jobs.queue({ task: "cache-cleanup", input: {} });
    await payload.db.drizzle.execute(sql`UPDATE payload.payload_jobs
      SET has_error = true, updated_at = NOW() - INTERVAL '8 days'
      WHERE id = ${removable.id}`);
    // Newer processing rows occupy the default descending-createdAt first page.
    await payload.db.drizzle.execute(sql`INSERT INTO payload.payload_jobs
      (task_slug, input, has_error, processing, updated_at, created_at)
      SELECT 'cache-cleanup', '{}'::jsonb, true, true,
        NOW() - INTERVAL '8 days', NOW() + INTERVAL '1 minute'
      FROM generate_series(1, 500)`);

    await jobCleanupJob.handler({ req: { payload } });

    expect(
      (await payload.count({ collection: "payload-jobs", where: { id: { equals: removable.id } } })).totalDocs
    ).toBe(0);
    expect(
      (await payload.count({ collection: "payload-jobs", where: { processing: { equals: true } } })).totalDocs
    ).toBe(500);
  });

  it.each(["failed", "completed"])("preserves a %s job restarted after cleanup selected it", async (state) => {
    const { payload } = env;
    const job = await payload.jobs.queue({ task: "cache-cleanup", input: {} });
    await payload.db.drizzle.execute(sql`UPDATE payload.payload_jobs
      SET has_error = ${state === "failed"}, updated_at = NOW() - INTERVAL '8 days',
        completed_at = CASE WHEN ${state === "completed"} THEN NOW() - INTERVAL '8 days' ELSE NULL END
      WHERE id = ${job.id}`);

    const req = await createLocalReq({}, payload);
    await initTransaction(req);
    const db = await getTransactionAwareDrizzle(payload, req);
    await db.execute(sql`SELECT id FROM payload.payload_jobs WHERE id = ${job.id} FOR UPDATE`);
    const { rows: owners } = await db.execute(sql`SELECT pg_backend_pid() AS pid`);
    const cleanup = jobCleanupJob.handler({ req: { payload } });
    try {
      // Observe actual lock contention, not a sleep that guesses when cleanup selected the row.
      await vi.waitFor(
        async () => {
          const { rows } = await payload.db.drizzle.execute(sql`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE ${owners[0].pid} = ANY(pg_blocking_pids(pid))
        ) AS blocked`);
          expect(rows[0]?.blocked).toBe(true);
        },
        { timeout: 5000, interval: 20 }
      );
      await db.execute(sql`UPDATE payload.payload_jobs
        SET has_error = false, completed_at = NULL, processing = true, updated_at = NOW()
        WHERE id = ${job.id}`);
      await commitTransaction(req);
    } finally {
      await killTransaction(req);
      await cleanup;
    }

    const restarted = await payload.findByID({ collection: "payload-jobs", id: job.id });
    expect(restarted.hasError).toBe(false);
    expect(restarted.completedAt).toBeNull();
    expect(restarted.processing).toBe(true);
  });

  it("retains blocked jobs and deletes them after the database failure is resolved", async () => {
    const { payload } = env;
    const blocked = await payload.jobs.queue({ task: "cache-cleanup", input: {} });
    const removable = await payload.jobs.queue({ task: "cache-cleanup", input: {} });
    await payload.db.drizzle.execute(sql`UPDATE payload.payload_jobs
      SET has_error = true, updated_at = NOW() - INTERVAL '8 days'
      WHERE id IN (${blocked.id}, ${removable.id})`);
    const cleanup = await payload.jobs.queue({ task: "job-cleanup", queue: "maintenance", input: {} });

    // A real foreign key blocks one deletion. Match the worker database's unlogged tables.
    await payload.db.drizzle.execute(sql`CREATE UNLOGGED TABLE payload.job_cleanup_test_reference
      (job_id integer REFERENCES payload.payload_jobs(id))`);
    try {
      await payload.db.drizzle.execute(sql`INSERT INTO payload.job_cleanup_test_reference VALUES (${blocked.id})`);
      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: cleanup.id } } });

      expect(
        (await payload.count({ collection: "payload-jobs", where: { id: { equals: removable.id } } })).totalDocs
      ).toBe(0);
      expect((await payload.findByID({ collection: "payload-jobs", id: blocked.id })).hasError).toBe(true);
      const retrying = await payload.findByID({ collection: "payload-jobs", id: cleanup.id });
      expect(retrying.totalTried).toBe(1);
      expect(retrying.hasError).toBe(false);
      expect(retrying.completedAt).toBeFalsy();
    } finally {
      await payload.db.drizzle.execute(sql`DROP TABLE payload.job_cleanup_test_reference`);
    }

    await payload.jobs.run({ queue: "maintenance", where: { id: { equals: cleanup.id } } });
    const remaining = await payload.count({
      collection: "payload-jobs",
      where: { id: { in: [blocked.id, removable.id, cleanup.id] } },
    });
    expect(remaining.totalDocs).toBe(0);
  });
});
