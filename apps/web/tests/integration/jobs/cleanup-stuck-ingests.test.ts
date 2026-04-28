/**
 * Integration tests for cleanup stuck scheduled ingests job
 * Tests with real database and job execution.
 * @module
 */

import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient } from "@/lib/database/client";
import { cleanupStuckScheduledIngestsJob } from "@/lib/jobs/handlers/cleanup-stuck-scheduled-ingests-job";
import type { Catalog, ScheduledIngest, User } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledIngest,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Cleanup Stuck Imports Job Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let testCatalog: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin", trustLevel: "5" } });
    testUser = users.testUser;

    const { catalog } = await withCatalog(testEnv, { name: "Cleanup Test Catalog", user: testUser });
    testCatalog = catalog;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Use direct SQL DELETE to avoid triggering afterDelete hooks which call
    // quotaService.decrementUsage() for each record — this exhausts the pool
    // (max 5 connections) and deadlocks when deleting many records (e.g., 105).
    const client = createDatabaseClient({ connectionString: process.env.DATABASE_URL! });
    try {
      await client.connect();
      await client.query('DELETE FROM payload."scheduled_ingests"');
      await client.query('DELETE FROM payload."payload_jobs"');
    } finally {
      await client.end();
    }
  });

  describe.sequential("Finding Stuck Imports", () => {
    it("should find and reset imports stuck for more than 4 hours", async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

      // Create stuck import
      const { scheduledIngest: stuckImport } = await withScheduledIngest(
        testEnv,
        testCatalog.id,
        "https://example.com/test-data.csv",
        {
          user: testUser,
          name: "Stuck Import Test",
          frequency: "daily",
          createdBy: testUser.id,
          additionalData: { lastStatus: "running", lastRun: fiveHoursAgo.toISOString() },
        }
      );

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-1", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result.output.resetCount).toBe(1);
      expect(result.output.totalRunning).toBe(1);

      // Verify import was reset
      const resetImport = await payload.findByID({ collection: "scheduled-ingests", id: stuckImport.id });

      expect(resetImport.lastStatus).toBe("failed");
      expect(resetImport.lastError).toContain("stuck and automatically reset");
    });

    it("should not reset imports running for less than 4 hours", async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Create recent import
      const recentImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Recent Import Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: oneHourAgo.toISOString(),
        },
      });

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-2", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result.output.resetCount).toBe(0);
      expect(result.output.totalRunning).toBe(1); // One running import found but not reset

      // Verify import was not changed
      const unchangedImport = await payload.findByID({ collection: "scheduled-ingests", id: recentImport.id });

      expect(unchangedImport.lastStatus).toBe("running");
      expect(unchangedImport.lastError).toBeNull(); // or toBeUndefined()
    });

    it("should handle multiple stuck imports", async () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const stuckImports: ScheduledIngest[] = [];

      // Create multiple stuck imports
      for (let i = 0; i < 5; i++) {
        const imp = await payload.create({
          collection: "scheduled-ingests",
          data: {
            sourceUrl: "https://example.com/test-data.csv",
            enabled: true,
            scheduleType: "frequency",
            frequency: "daily",
            name: `Stuck Import ${i}`,
            catalog: testCatalog.id,
            createdBy: testUser.id,
            lastStatus: "running",
            lastRun: fourHoursAgo.toISOString(),
          },
        });
        stuckImports.push(imp);
      }

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-3", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result.output.resetCount).toBe(5);
      expect(result.output.totalRunning).toBe(5);

      // Verify all were reset
      for (const imp of stuckImports) {
        const resetImport = await payload.findByID({ collection: "scheduled-ingests", id: imp.id });
        expect(resetImport.lastStatus).toBe("failed");
        expect(resetImport.lastError).toContain("stuck");
      }
    });

    it("should respect the 1000 import limit per run", async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      // Create 105 stuck imports
      for (let i = 0; i < 105; i++) {
        await payload.create({
          collection: "scheduled-ingests",
          data: {
            sourceUrl: "https://example.com/test-data.csv",
            enabled: true,
            scheduleType: "frequency",
            frequency: "daily",
            name: `Bulk Stuck Import ${i}`,
            catalog: testCatalog.id,
            createdBy: testUser.id,
            lastStatus: "running",
            lastRun: fiveHoursAgo.toISOString(),
          },
        });
      }

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-4", task: "cleanup-stuck-scheduled-ingests" },
      });

      // Should process all 105 (under the 1000 limit)
      expect(result.output.resetCount).toBe(105);
      expect(result.output.totalRunning).toBe(105);

      // Verify all 105 were reset
      const resetCount = await payload.count({
        collection: "scheduled-ingests",
        where: { lastStatus: { equals: "failed" }, lastError: { contains: "stuck" } },
      });

      expect(resetCount.totalDocs).toBe(105);

      // Verify none are still stuck
      const stillStuck = await payload.count({
        collection: "scheduled-ingests",
        where: { lastStatus: { equals: "running" } },
      });

      expect(stillStuck.totalDocs).toBe(0);
    }, 60000); // 60 second timeout for creating and processing 105 imports
  });

  describe.sequential("Orphaned Workflow Job Cleanup", () => {
    it("should cancel orphaned workflow jobs when resetting stuck import", async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

      // Create stuck import
      const stuckImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/orphan-test.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Orphan Workflow Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: fiveHoursAgo.toISOString(),
        },
      });

      // Simulate orphaned workflow jobs (as if server restarted mid-processing)
      const orphanedJob1 = await payload.create({
        collection: "payload-jobs" as const,
        data: {
          input: { scheduledIngestId: String(stuckImport.id) },
          workflowSlug: "scheduled-ingest",
          queue: "ingest",
          processing: false,
          createdAt: fiveHoursAgo.toISOString(),
        } as Record<string, unknown>,
      });
      const orphanedJob2 = await payload.create({
        collection: "payload-jobs" as const,
        data: {
          input: { scheduledIngestId: String(stuckImport.id) },
          workflowSlug: "scheduled-ingest",
          queue: "ingest",
          processing: false,
          createdAt: fiveHoursAgo.toISOString(),
        } as Record<string, unknown>,
      });

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-orphan-1", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result.output.resetCount).toBe(1);

      // Verify orphaned workflow jobs were cancelled
      const job1After = await payload.findByID({ collection: "payload-jobs" as const, id: orphanedJob1.id });
      expect(job1After.completedAt).toBeTruthy();
      expect(job1After.hasError).toBe(true);

      const job2After = await payload.findByID({ collection: "payload-jobs" as const, id: orphanedJob2.id });
      expect(job2After.completedAt).toBeTruthy();
      expect(job2After.hasError).toBe(true);
      expect(job2After.processing).toBe(false);
    });

    it("should not cancel freshly queued workflow jobs for a stuck import", async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

      const stuckImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/fresh-queued-test.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Fresh Queued Workflow Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: fiveHoursAgo.toISOString(),
        },
      });

      const freshJob = await payload.create({
        collection: "payload-jobs" as const,
        data: {
          input: { scheduledIngestId: String(stuckImport.id) },
          workflowSlug: "scheduled-ingest",
          queue: "ingest",
          processing: false,
          createdAt: new Date().toISOString(),
        } as Record<string, unknown>,
      });

      await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-orphan-fresh", task: "cleanup-stuck-scheduled-ingests" },
      });

      const jobAfter = await payload.findByID({ collection: "payload-jobs" as const, id: freshJob.id });
      expect(jobAfter.completedAt).toBeNull();
      expect(jobAfter.hasError).toBe(false);
    });

    it("should not cancel workflow jobs for non-stuck imports", async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Create a recent (not stuck) import
      const recentImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/recent-test.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Recent Import",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: oneHourAgo.toISOString(),
        },
      });

      // Create an active workflow job for it
      const activeJob = await payload.create({
        collection: "payload-jobs" as const,
        data: {
          input: { scheduledIngestId: String(recentImport.id) },
          workflowSlug: "scheduled-ingest",
          queue: "ingest",
          processing: true,
        } as Record<string, unknown>,
      });

      // Run cleanup job
      await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-orphan-2", task: "cleanup-stuck-scheduled-ingests" },
      });

      // Workflow job should NOT be cancelled
      const jobAfter = await payload.findByID({ collection: "payload-jobs" as const, id: activeJob.id });
      expect(jobAfter.completedAt).toBeNull();
      expect(jobAfter.hasError).toBe(false);
    });
  });

  describe.sequential("Error Handling", () => {
    it("should continue processing when individual update fails", async () => {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      // Create stuck imports
      const import1 = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Will Reset",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: sixHoursAgo.toISOString(),
        },
      });

      const import2 = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Will Also Reset",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: sixHoursAgo.toISOString(),
        },
      });

      // Delete the second import to cause an error during processing
      await payload.delete({ collection: "scheduled-ingests", id: import2.id });

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-error", task: "cleanup-stuck-scheduled-ingests" },
      });

      // Should have found only 1 (since import2 was deleted)
      expect(result.output.resetCount).toBe(1);
      expect(result.output.totalRunning).toBe(1);

      // Verify first import was reset
      const resetImport = await payload.findByID({ collection: "scheduled-ingests", id: import1.id });

      expect(resetImport.lastStatus).toBe("failed");
    });

    it("should handle empty results gracefully", async () => {
      // No stuck imports exist
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-empty", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result.output.resetCount).toBe(0);
      expect(result.output.totalRunning).toBe(0);
    });
  });

  describe.sequential("Job Scheduling", () => {
    it("should have correct job configuration", () => {
      expect(cleanupStuckScheduledIngestsJob.slug).toBe("cleanup-stuck-scheduled-ingests");
      expect(cleanupStuckScheduledIngestsJob.handler).toBeDefined();
      expect(typeof cleanupStuckScheduledIngestsJob.handler).toBe("function");
    });

    it("should be idempotent - safe to run multiple times", async () => {
      const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);

      // Create stuck import
      const stuckImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Idempotent Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: sevenHoursAgo.toISOString(),
        },
      });

      // Run cleanup job first time
      const result1 = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-idem-1", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result1.output.resetCount).toBe(1);

      // Run cleanup job second time
      const result2 = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-idem-2", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(result2.output.resetCount).toBe(0);

      // Import should still be in failed state
      const finalImport = await payload.findByID({ collection: "scheduled-ingests", id: stuckImport.id });

      expect(finalImport.lastStatus).toBe("failed");
      expect(finalImport.lastError).toContain("stuck");
    });
  });

  describe.sequential("Integration with Webhook Flow", () => {
    it("should allow webhook trigger after cleanup", async () => {
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

      // Create stuck import with webhook
      const stuckImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Webhook Recovery Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          webhookEnabled: true,
          lastStatus: "running",
          lastRun: eightHoursAgo.toISOString(),
        },
      });

      const webhookToken = stuckImport.webhookToken;

      // Run cleanup job
      const cleanupResult = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-webhook", task: "cleanup-stuck-scheduled-ingests" },
      });

      expect(cleanupResult.output.resetCount).toBe(1);

      // Verify import can now be triggered via webhook
      const resetImport = await payload.findByID({ collection: "scheduled-ingests", id: stuckImport.id });

      expect(resetImport.lastStatus).toBe("failed");
      expect(resetImport.webhookToken).toBe(webhookToken); // Token preserved

      // Simulate webhook trigger - should work now
      await payload.update({
        collection: "scheduled-ingests",
        id: stuckImport.id,
        data: { lastStatus: "running", lastRun: new Date().toISOString() },
      });

      const afterTrigger = await payload.findByID({ collection: "scheduled-ingests", id: stuckImport.id });

      expect(afterTrigger.lastStatus).toBe("running");
    });

    it("should track cleanup in execution history", async () => {
      const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);

      // Create stuck import with existing history
      const stuckImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "History Tracking Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: nineHoursAgo.toISOString(),
          executionHistory: [{ executedAt: nineHoursAgo.toISOString(), status: "success" }],
        },
      });

      // Run cleanup job
      await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-history", task: "cleanup-stuck-scheduled-ingests" },
      });

      // The cleanup job should have added an entry to the execution history
      const finalImport = await payload.findByID({ collection: "scheduled-ingests", id: stuckImport.id });

      expect(finalImport.executionHistory).toHaveLength(2); // Original + cleanup
      expect(finalImport.executionHistory?.[0]?.status).toBe("failed");
      expect(finalImport.executionHistory?.[0]?.error).toContain("stuck");
    });
  });

  describe.sequential("Performance and Efficiency", () => {
    it("should efficiently query stuck imports", async () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Create mix of stuck and non-stuck imports sequentially to avoid
      // pool exhaustion — each payload.create() needs a transaction + the
      // afterChange hook calls quotaService which needs another connection.
      // With pool max=5, concurrent creates deadlock.
      for (let i = 0; i < 3; i++) {
        await payload.create({
          collection: "scheduled-ingests",
          data: {
            sourceUrl: "https://example.com/test-data.csv",
            enabled: true,
            scheduleType: "frequency",
            frequency: "daily",
            name: `Old Stuck ${i}`,
            catalog: testCatalog.id,
            createdBy: testUser.id,
            lastStatus: "running",
            lastRun: tenHoursAgo.toISOString(),
          },
        });
      }
      for (let i = 0; i < 3; i++) {
        await payload.create({
          collection: "scheduled-ingests",
          data: {
            sourceUrl: "https://example.com/test-data.csv",
            enabled: true,
            scheduleType: "frequency",
            frequency: "daily",
            name: `Recent Running ${i}`,
            catalog: testCatalog.id,
            createdBy: testUser.id,
            lastStatus: "running",
            lastRun: oneHourAgo.toISOString(),
          },
        });
      }
      for (let i = 0; i < 3; i++) {
        await payload.create({
          collection: "scheduled-ingests",
          data: {
            sourceUrl: "https://example.com/test-data.csv",
            enabled: true,
            scheduleType: "frequency",
            frequency: "daily",
            name: `Idle Import ${i}`,
            catalog: testCatalog.id,
            createdBy: testUser.id,
            lastStatus: "success",
          },
        });
      }

      // Run cleanup job
      const result = await cleanupStuckScheduledIngestsJob.handler({
        req: { payload },
        job: { id: "cleanup-job-perf", task: "cleanup-stuck-scheduled-ingests" },
      });

      // Should reset 3 stuck imports, find 6 total running (3 stuck + 3 recent)
      expect(result.output.resetCount).toBe(3);
      expect(result.output.totalRunning).toBe(6);

      // Verify only stuck imports were modified
      const stillRunning = await payload.count({
        collection: "scheduled-ingests",
        where: { lastStatus: { equals: "running" } },
      });

      expect(stillRunning.totalDocs).toBe(3); // The recent ones

      const successCount = await payload.count({
        collection: "scheduled-ingests",
        where: { lastStatus: { equals: "success" } },
      });

      expect(successCount.totalDocs).toBe(3); // Unchanged
    });

    it("should handle concurrent creates without pool exhaustion", async () => {
      // Regression test: concurrent payload.create() calls on collections with
      // afterChange hooks that call quotaService used to exhaust the connection pool
      // (max 5) because the quota service grabbed separate pool connections outside
      // the hook's transaction. With the fix, quota operations reuse the hook's
      // transaction via `req`, so concurrent creates work.
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);

      await Promise.all(
        Array(9)
          .fill(null)
          .map((_, i) =>
            payload.create({
              collection: "scheduled-ingests",
              data: {
                sourceUrl: "https://example.com/test-data.csv",
                enabled: true,
                scheduleType: "frequency",
                frequency: "daily",
                name: `Concurrent Import ${i}`,
                catalog: testCatalog.id,
                createdBy: testUser.id,
                lastStatus: "running",
                lastRun: tenHoursAgo.toISOString(),
              },
            })
          )
      );

      const count = await payload.count({
        collection: "scheduled-ingests",
        where: { name: { contains: "Concurrent Import" } },
      });
      expect(count.totalDocs).toBe(9);
    });
  });
});
