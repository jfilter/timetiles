/**
 * Verifies native retries for partial job cleanup failures.
 * @module
 * @category Tests
 */
import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("Job cleanup retries", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
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
