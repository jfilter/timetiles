/**
 * Verifies recovery of failed ingest-file deletion through the orphan sweep.
 * @module
 * @category Tests
 */
import { existsSync } from "node:fs";
import { mkdir, rm, rmdir, unlink, utimes, writeFile } from "node:fs/promises";

import { sql } from "@payloadcms/db-postgres";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getEnv } from "@/lib/config/env";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { ingestFilesCleanupJob } from "@/lib/jobs/handlers/ingest-files-cleanup-job";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
} from "@/tests/setup/integration/environment";

describe.sequential("Ingest file cleanup retries", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("waits for an in-flight reference before deleting an apparent orphan", async () => {
    const { payload } = env;
    const { ingestFile } = await withIngestFile(env, null, "name\nLate reference\n");
    const path = getIngestFilePath(ingestFile.filename);
    const old = new Date(Date.now() - (getEnv().INGEST_FILE_ORPHAN_GRACE_HOURS + 1) * 60 * 60 * 1000);
    await utimes(path, old, old);
    await payload.db.drizzle.execute(sql`UPDATE payload.ingest_files SET filename = NULL WHERE id = ${ingestFile.id}`);

    const req = await createLocalReq({}, payload);
    await initTransaction(req);
    const db = await getTransactionAwareDrizzle(payload, req);
    await db.execute(
      sql`UPDATE payload.ingest_files SET filename = ${ingestFile.filename} WHERE id = ${ingestFile.id}`
    );
    const { rows: owners } = await db.execute(sql`SELECT pg_backend_pid() AS pid`);
    const cleanup = ingestFilesCleanupJob.handler({ req: { payload } });
    try {
      await vi.waitFor(
        async () => {
          const { rows } = await payload.db.drizzle.execute(sql`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE ${owners[0].pid} = ANY(pg_blocking_pids(pid))
        ) AS blocked`);
          expect(rows[0]?.blocked).toBe(true);
        },
        { timeout: 5000, interval: 20 }
      );
      await commitTransaction(req);
    } finally {
      await killTransaction(req);
      await cleanup;
    }
    expect(existsSync(path)).toBe(true);
    expect((await payload.findByID({ collection: "ingest-files", id: ingestFile.id })).filename).toBe(
      ingestFile.filename
    );
  });

  it.each([PROCESSING_STAGE.ANALYZE_DUPLICATES, PROCESSING_STAGE.NEEDS_REVIEW])(
    "preserves a stale terminal file with a %s child job",
    async (stage) => {
      const { payload } = env;
      const { ingestFile } = await withIngestFile(env, null, "name\nActive source\n", { status: "failed" });
      const user = await payload.findByID({ collection: "users", id: ingestFile.user.id ?? ingestFile.user });
      const { catalog } = await withCatalog(env, { user });
      const { dataset } = await withDataset(env, catalog.id);
      await payload.create({
        collection: "ingest-jobs",
        data: { ingestFile: ingestFile.id, dataset: dataset.id, stage },
      });
      const old = new Date(Date.now() - (getEnv().INGEST_FILE_RETENTION_HOURS + 1) * 60 * 60 * 1000);
      await payload.db.drizzle.execute(sql`UPDATE payload.ingest_files SET updated_at = ${old.toISOString()}
        WHERE id = ${ingestFile.id}`);
      await ingestFilesCleanupJob.handler({ req: { payload } });
      expect((await payload.findByID({ collection: "ingest-files", id: ingestFile.id })).filename).toBe(
        ingestFile.filename
      );
      expect(existsSync(getIngestFilePath(ingestFile.filename))).toBe(true);
    }
  );

  it("preserves a file recovered after cleanup selected it", async () => {
    const { payload } = env;
    const { ingestFile } = await withIngestFile(env, null, "name\nRecovering\n", { status: "failed" });
    const old = new Date(Date.now() - (getEnv().INGEST_FILE_RETENTION_HOURS + 1) * 60 * 60 * 1000);
    await payload.db.drizzle.execute(sql`UPDATE payload.ingest_files SET updated_at = ${old.toISOString()}
      WHERE id = ${ingestFile.id}`);
    const req = await createLocalReq({}, payload);
    await initTransaction(req);
    const db = await getTransactionAwareDrizzle(payload, req);
    await db.execute(sql`SELECT id FROM payload.ingest_files WHERE id = ${ingestFile.id} FOR UPDATE`);
    const { rows: owners } = await db.execute(sql`SELECT pg_backend_pid() AS pid`);
    const cleanup = ingestFilesCleanupJob.handler({ req: { payload } });
    try {
      await vi.waitFor(
        async () => {
          const { rows } = await payload.db.drizzle.execute(sql`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE ${owners[0].pid} = ANY(pg_blocking_pids(pid))
        ) AS blocked`);
          expect(rows[0]?.blocked).toBe(true);
        },
        { timeout: 5000, interval: 20 }
      );
      await payload.update({
        collection: "ingest-files",
        id: ingestFile.id,
        data: { status: "processing", completedAt: null },
        context: { skipIngestFileHooks: true },
        req,
      });
      await commitTransaction(req);
    } finally {
      await killTransaction(req);
      await cleanup;
    }
    const after = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    expect(after.filename).toBe(ingestFile.filename);
    expect(existsSync(getIngestFilePath(ingestFile.filename))).toBe(true);
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
