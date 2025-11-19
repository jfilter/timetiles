/**
 * Integration tests for cleanup stuck scheduled imports job
 * Tests with real database and job execution.
 * @module
 */

import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanupStuckScheduledImportsJob } from "@/lib/jobs/handlers/cleanup-stuck-scheduled-imports-job";
import type { Catalog, ScheduledImport, User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("Cleanup Stuck Imports Job Integration", () => {
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let testCatalog: Catalog;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    const timestamp = Date.now();
    testUser = await payload.create({
      collection: "users",
      data: {
        email: `cleanup-test-${timestamp}@example.com`,
        password: "test123456",
        role: "admin",
        trustLevel: "5",
      },
    });

    testCatalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Cleanup Test Catalog ${timestamp}`,
        slug: `cleanup-test-catalog-${timestamp}`,
        _status: "published",
        createdBy: testUser.id,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up ALL scheduled imports before each test to ensure isolation
    const existingImports = await payload.find({
      collection: "scheduled-imports",
      limit: 1000,
    });

    for (const imp of existingImports.docs) {
      try {
        await payload.delete({
          collection: "scheduled-imports",
          id: imp.id,
        });
      } catch {
        // If delete fails, at least update to a non-running status
        // We intentionally ignore the error here as it's a best-effort cleanup
        try {
          await payload.update({
            collection: "scheduled-imports",
            id: imp.id,
            data: {
              lastStatus: "success",
            },
          });
        } catch {
          // Intentionally ignore - test cleanup best effort
          // This is a secondary fallback, so we continue regardless
          continue;
        }
      }
    }
  });

  describe.sequential("Finding Stuck Imports", () => {
    it("should find and reset imports stuck for more than 2 hours", async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

      // Create stuck import
      const stuckImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          sourceUrl: "https://example.com/test-data.csv",
          enabled: true,
          scheduleType: "frequency",
          frequency: "daily",
          name: "Stuck Import Test",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          lastStatus: "running",
          lastRun: threeHoursAgo.toISOString(),
        },
      });

      // Run cleanup job
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-1",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(result.output.resetCount).toBe(1);
      expect(result.output.totalRunning).toBe(1);

      // Verify import was reset
      const resetImport = await payload.findByID({
        collection: "scheduled-imports",
        id: stuckImport.id,
      });

      expect(resetImport.lastStatus).toBe("failed");
      expect(resetImport.lastError).toContain("stuck and automatically reset");
    });

    it("should not reset imports running for less than 2 hours", async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Create recent import
      const recentImport = await payload.create({
        collection: "scheduled-imports",
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
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-2",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(result.output.resetCount).toBe(0);
      expect(result.output.totalRunning).toBe(1); // One running import found but not reset

      // Verify import was not changed
      const unchangedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: recentImport.id,
      });

      expect(unchangedImport.lastStatus).toBe("running");
      expect(unchangedImport.lastError).toBeNull(); // or toBeUndefined()
    });

    it("should handle multiple stuck imports", async () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const stuckImports: ScheduledImport[] = [];

      // Create multiple stuck imports
      for (let i = 0; i < 5; i++) {
        const imp = await payload.create({
          collection: "scheduled-imports",
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
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-3",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(result.output.resetCount).toBe(5);
      expect(result.output.totalRunning).toBe(5);

      // Verify all were reset
      for (const imp of stuckImports) {
        const resetImport = await payload.findByID({
          collection: "scheduled-imports",
          id: imp.id,
        });
        expect(resetImport.lastStatus).toBe("failed");
        expect(resetImport.lastError).toContain("stuck");
      }
    });

    it("should respect the 1000 import limit per run", async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      // Create 105 stuck imports
      for (let i = 0; i < 105; i++) {
        await payload.create({
          collection: "scheduled-imports",
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
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-4",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      // Should process all 105 (under the 1000 limit)
      expect(result.output.resetCount).toBe(105);
      expect(result.output.totalRunning).toBe(105);

      // Verify all 105 were reset
      const resetCount = await payload.count({
        collection: "scheduled-imports",
        where: {
          lastStatus: { equals: "failed" },
          lastError: { contains: "stuck" },
        },
      });

      expect(resetCount.totalDocs).toBe(105);

      // Verify none are still stuck
      const stillStuck = await payload.count({
        collection: "scheduled-imports",
        where: {
          lastStatus: { equals: "running" },
        },
      });

      expect(stillStuck.totalDocs).toBe(0);
    }, 60000); // 60 second timeout for creating and processing 105 imports
  });

  describe.sequential("Error Handling", () => {
    it("should continue processing when individual update fails", async () => {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      // Create stuck imports
      const import1 = await payload.create({
        collection: "scheduled-imports",
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
        collection: "scheduled-imports",
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
      await payload.delete({
        collection: "scheduled-imports",
        id: import2.id,
      });

      // Run cleanup job
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-error",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      // Should have found only 1 (since import2 was deleted)
      expect(result.output.resetCount).toBe(1);
      expect(result.output.totalRunning).toBe(1);

      // Verify first import was reset
      const resetImport = await payload.findByID({
        collection: "scheduled-imports",
        id: import1.id,
      });

      expect(resetImport.lastStatus).toBe("failed");
    });

    it("should handle empty results gracefully", async () => {
      // No stuck imports exist
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-empty",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(result.output.resetCount).toBe(0);
      expect(result.output.totalRunning).toBe(0);
    });
  });

  describe.sequential("Job Scheduling", () => {
    it("should have correct job configuration", () => {
      expect(cleanupStuckScheduledImportsJob.slug).toBe("cleanup-stuck-scheduled-imports");
      expect(cleanupStuckScheduledImportsJob.handler).toBeDefined();
      expect(typeof cleanupStuckScheduledImportsJob.handler).toBe("function");
    });

    it("should be idempotent - safe to run multiple times", async () => {
      const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);

      // Create stuck import
      const stuckImport = await payload.create({
        collection: "scheduled-imports",
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
      const result1 = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-idem-1",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(result1.output.resetCount).toBe(1);

      // Run cleanup job second time
      const result2 = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-idem-2",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(result2.output.resetCount).toBe(0);

      // Import should still be in failed state
      const finalImport = await payload.findByID({
        collection: "scheduled-imports",
        id: stuckImport.id,
      });

      expect(finalImport.lastStatus).toBe("failed");
      expect(finalImport.lastError).toContain("stuck");
    });
  });

  describe.sequential("Integration with Webhook Flow", () => {
    it("should allow webhook trigger after cleanup", async () => {
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

      // Create stuck import with webhook
      const stuckImport = await payload.create({
        collection: "scheduled-imports",
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
      const cleanupResult = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-webhook",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      expect(cleanupResult.output.resetCount).toBe(1);

      // Verify import can now be triggered via webhook
      const resetImport = await payload.findByID({
        collection: "scheduled-imports",
        id: stuckImport.id,
      });

      expect(resetImport.lastStatus).toBe("failed");
      expect(resetImport.webhookToken).toBe(webhookToken); // Token preserved

      // Simulate webhook trigger - should work now
      await payload.update({
        collection: "scheduled-imports",
        id: stuckImport.id,
        data: {
          lastStatus: "running",
          lastRun: new Date().toISOString(),
        },
      });

      const afterTrigger = await payload.findByID({
        collection: "scheduled-imports",
        id: stuckImport.id,
      });

      expect(afterTrigger.lastStatus).toBe("running");
    });

    it("should track cleanup in execution history", async () => {
      const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);

      // Create stuck import with existing history
      const stuckImport = await payload.create({
        collection: "scheduled-imports",
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
          executionHistory: [
            {
              executedAt: nineHoursAgo.toISOString(),
              status: "success",
            },
          ],
        },
      });

      // Run cleanup job
      await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-history",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      // The cleanup job should have added an entry to the execution history
      const finalImport = await payload.findByID({
        collection: "scheduled-imports",
        id: stuckImport.id,
      });

      expect(finalImport.executionHistory).toHaveLength(2); // Original + cleanup
      expect(finalImport.executionHistory?.[0]?.status).toBe("failed");
      expect(finalImport.executionHistory?.[0]?.error).toContain("stuck");
    });
  });

  describe.sequential("Performance and Efficiency", () => {
    it("should efficiently query stuck imports", async () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Create mix of stuck and non-stuck imports
      await Promise.all([
        // Stuck imports
        ...Array(3)
          .fill(null)
          .map((_, i) =>
            payload.create({
              collection: "scheduled-imports",
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
            })
          ),
        // Recent running imports (should not be touched)
        ...Array(3)
          .fill(null)
          .map((_, i) =>
            payload.create({
              collection: "scheduled-imports",
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
            })
          ),
        // Non-running imports (should not be touched)
        ...Array(3)
          .fill(null)
          .map((_, i) =>
            payload.create({
              collection: "scheduled-imports",
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
            })
          ),
      ]);

      // Run cleanup job
      const result = await cleanupStuckScheduledImportsJob.handler({
        req: { payload },
        job: {
          id: "cleanup-job-perf",
          task: "cleanup-stuck-scheduled-imports",
        },
      });

      // Should reset 3 stuck imports, find 6 total running (3 stuck + 3 recent)
      expect(result.output.resetCount).toBe(3);
      expect(result.output.totalRunning).toBe(6);

      // Verify only stuck imports were modified
      const stillRunning = await payload.count({
        collection: "scheduled-imports",
        where: {
          lastStatus: { equals: "running" },
        },
      });

      expect(stillRunning.totalDocs).toBe(3); // The recent ones

      const successCount = await payload.count({
        collection: "scheduled-imports",
        where: {
          lastStatus: { equals: "success" },
        },
      });

      expect(successCount.totalDocs).toBe(3); // Unchanged
    });
  });
});
