/**
 * Verifies recovery of failed ingest-file deletion through the orphan sweep.
 * @module
 * @category Tests
 */
import { existsSync } from "node:fs";
import { mkdir, rm, rmdir, unlink, utimes, writeFile } from "node:fs/promises";

import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getEnv } from "@/lib/config/env";
import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { createIntegrationTestEnvironment, withIngestFile } from "@/tests/setup/integration/environment";

describe.sequential("Ingest file cleanup retries", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("recovers failed deletion through the orphan sweep while preserving a referenced file", async () => {
    const { payload } = env;
    const { ingestFile: reclaimable } = await withIngestFile(env, null, "name\nReclaimable\n");
    const { ingestFile: referenced } = await withIngestFile(env, null, "name\nReferenced\n");
    const reclaimPath = getIngestFilePath(reclaimable.filename);
    const keepPath = getIngestFilePath(referenced.filename);
    const old = new Date(
      Date.now() -
        (Math.max(getEnv().INGEST_FILE_RETENTION_HOURS, getEnv().INGEST_FILE_ORPHAN_GRACE_HOURS) + 1) * 60 * 60 * 1000
    );
    try {
      await payload.db.drizzle.execute(sql`UPDATE payload.ingest_files
        SET status = 'completed', completed_at = ${old.toISOString()} WHERE id = ${reclaimable.id}`);
      // unlink cannot remove a directory, even when tests run with elevated filesystem rights.
      await unlink(reclaimPath);
      await mkdir(reclaimPath);
      await utimes(keepPath, old, old);
      const job = await payload.jobs.queue({ task: "ingest-files-cleanup", queue: "maintenance", input: {} });
      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });

      expect((await payload.findByID({ collection: "ingest-files", id: reclaimable.id })).filename).toBeNull();
      expect(existsSync(reclaimPath)).toBe(true);
      const retrying = await payload.findByID({ collection: "payload-jobs", id: job.id });
      expect(retrying.totalTried).toBe(1);
      expect(retrying.hasError).toBe(false);
      expect(retrying.completedAt).toBeFalsy();

      await rmdir(reclaimPath);
      await writeFile(reclaimPath, "name\nRecovered\n");
      await utimes(reclaimPath, old, old);
      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });

      expect(existsSync(reclaimPath)).toBe(false);
      expect(existsSync(keepPath)).toBe(true);
      expect((await payload.findByID({ collection: "ingest-files", id: referenced.id })).filename).toBe(
        referenced.filename
      );
      expect((await payload.count({ collection: "payload-jobs", where: { id: { equals: job.id } } })).totalDocs).toBe(
        0
      );
    } finally {
      await rm(reclaimPath, { recursive: true, force: true });
      await rm(keepPath, { force: true });
    }
  });
});
