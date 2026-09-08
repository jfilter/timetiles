/**
 * Verifies export cleanup retries against real Payload jobs and filesystem failures.
 * @module
 * @category Tests
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Data export cleanup retries", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("keeps failed archive references and finishes them on a native retry", async () => {
    const { payload } = env;
    const { users } = await withUsers(env, ["admin"]);
    const directory = await mkdtemp(join(tmpdir(), "export-cleanup-retry-"));
    const failedPath = join(directory, "blocked.zip");
    const successfulPath = join(directory, "successful.zip");
    try {
      // unlink cannot remove a directory, giving a real, deterministic filesystem error.
      await mkdir(failedPath);
      await writeFile(successfulPath, "export fixture");
      const exports = [];
      for (const filePath of [failedPath, successfulPath]) {
        exports.push(
          await payload.create({
            collection: "data-exports",
            data: {
              user: users.admin.id,
              status: "ready",
              requestedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() - 60_000).toISOString(),
              filePath,
            },
          })
        );
      }
      const job = await payload.jobs.queue({ task: "data-export-cleanup", queue: "maintenance", input: {} });
      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });

      const failed = await payload.findByID({ collection: "data-exports", id: exports[0]!.id });
      const successful = await payload.findByID({ collection: "data-exports", id: exports[1]!.id });
      expect(failed.status).toBe("expired");
      expect(failed.filePath).toBe(failedPath);
      expect(successful.status).toBe("expired");
      expect(successful.filePath).toBeNull();
      expect(existsSync(successfulPath)).toBe(false);
      const retryingJob = await payload.findByID({ collection: "payload-jobs", id: job.id });
      expect(retryingJob.totalTried).toBe(1);
      expect(retryingJob.hasError).toBe(false);
      expect(retryingJob.completedAt).toBeFalsy();

      await rmdir(failedPath);
      await writeFile(failedPath, "recovered export fixture");
      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });

      expect(existsSync(failedPath)).toBe(false);
      expect((await payload.findByID({ collection: "data-exports", id: failed.id })).filePath).toBeNull();
      expect((await payload.findByID({ collection: "data-exports", id: successful.id })).updatedAt).toBe(
        successful.updatedAt
      );
      expect((await payload.count({ collection: "payload-jobs", where: { id: { equals: job.id } } })).totalDocs).toBe(
        0
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
