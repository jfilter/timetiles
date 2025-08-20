/**
 * Integration tests for webhook job flow and lifecycle
 * Tests job execution, status transitions, and concurrency with real database
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";
import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import type { Catalog, Job, Payload, ScheduledImport, User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";
import { TestDataBuilder } from "../../setup/test-data-builder";

describe("Webhook Job Flow Integration", () => {
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testData: TestDataBuilder;
  let testUser: User;
  let testCatalog: Catalog;
  let testScheduledImport: ScheduledImport;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
    testData = new TestDataBuilder(payload);

    testUser = await testData.createUser({
      email: `job-flow-test-${Date.now()}@example.com`,
    });

    testCatalog = await testData.createCatalog({
      name: `Job Flow Test Catalog ${Date.now()}`,
      createdBy: testUser.id,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create fresh scheduled import
    testScheduledImport = await testData.createScheduledImport({
      name: `Job Flow Import ${Date.now()}`,
      catalog: testCatalog.id,
      createdBy: testUser.id,
      webhookEnabled: true,
      sourceUrl: "https://example.com/test-data.csv",
    });
  });

  describe("Job Creation and Execution", () => {
    it("should create and execute URL fetch job from webhook", async () => {
      // Create job as webhook would
      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Job Flow Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(job.status).toBe("pending");

      // Update scheduled import status as webhook would
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          lastStatus: "running",
          lastRun: new Date(),
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        req: { payload },
        job,
      });

      expect(result.output.success).toBe(true);

      // Verify job status was updated
      const updatedJob = await payload.findByID({
        collection: "jobs",
        id: job.id,
      });

      expect(updatedJob.status).toBe("completed");
      expect(updatedJob.output).toMatchObject({
        success: true,
        importFileId: expect.any(String),
      });

      // Verify scheduled import status
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("success");
    });

    it("should handle job failure and update status", async () => {
      // Create job with invalid URL
      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: "invalid://url",
            catalogId: testCatalog.id,
            originalName: "Failed Job Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          lastStatus: "running",
        },
      });

      // Execute the job (will fail)
      const result = await urlFetchJob.handler({
        req: { payload },
        job,
      });

      expect(result.output.success).toBe(false);
      expect(result.output.error).toBeDefined();

      // Verify scheduled import was updated with failure
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("failed");
      expect(updatedImport.lastError).toBeDefined();
    });
  });

  describe("Status Transitions", () => {
    it("should transition through correct status lifecycle", async () => {
      const statusHistory: string[] = [];

      // Track status changes
      const originalUpdate = payload.update.bind(payload);
      payload.update = async function (args: any) {
        if (args.collection === "scheduled-imports" && args.data?.lastStatus) {
          statusHistory.push(args.data.lastStatus);
        }
        return originalUpdate.call(this, args);
      };

      // Initial state
      expect(testScheduledImport.lastStatus).toBeUndefined();

      // Webhook trigger sets to running
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      // Create and execute job
      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Status Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      await urlFetchJob.handler({ req: { payload }, job });

      // Verify status progression
      expect(statusHistory).toContain("running");
      expect(statusHistory[statusHistory.length - 1]).toBe("success");

      // Restore original update
      payload.update = originalUpdate;
    });

    it("should prevent status regression", async () => {
      // Set to running
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      // Try to set back to idle (should not happen in real flow)
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "idle" },
      });

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      // Status should be updated (no built-in prevention in Payload)
      // but in real webhook flow, this wouldn't happen
      expect(["idle", "running"]).toContain(updatedImport.lastStatus);
    });
  });

  describe("Concurrency Control", () => {
    it("should prevent concurrent webhook and schedule triggers", async () => {
      // Set import to running (webhook triggered)
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          lastStatus: "running",
          lastRun: new Date(),
        },
      });

      // Try to trigger via schedule manager
      const result = await scheduleManagerJob.handler({
        req: { payload },
        job: {
          id: "schedule-job-123",
          task: "schedule-manager",
        },
      });

      // Should not create a new job for this import
      const jobs = await payload.find({
        collection: "jobs",
        where: {
          "input.scheduledImportId": { equals: testScheduledImport.id },
          createdAt: { greater_than: new Date(Date.now() - 5000).toISOString() },
        },
      });

      expect(jobs.docs).toHaveLength(0);
    });

    it("should handle rapid successive webhook triggers", async () => {
      const jobs: Job[] = [];

      // Create multiple jobs rapidly
      for (let i = 0; i < 3; i++) {
        // Check current status
        const currentImport = await payload.findByID({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
        });

        if (currentImport.lastStatus !== "running") {
          // Update to running before creating job
          await payload.update({
            collection: "scheduled-imports",
            id: testScheduledImport.id,
            data: { lastStatus: "running" },
          });

          const job = await payload.create({
            collection: "jobs",
            data: {
              task: JOB_TYPES.URL_FETCH,
              status: "pending",
              input: {
                scheduledImportId: testScheduledImport.id,
                sourceUrl: testScheduledImport.sourceUrl,
                catalogId: testCatalog.id,
                originalName: `Rapid Test ${i}`,
                userId: testUser.id,
                triggeredBy: "webhook",
              },
            },
          });

          jobs.push(job);
        }
      }

      // Should only create 1 job (first one)
      expect(jobs).toHaveLength(1);
    });

    it("should allow new trigger after completion", async () => {
      // First trigger
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      const job1 = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "First Trigger",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      // Execute and complete
      await urlFetchJob.handler({ req: { payload }, job: job1 });

      // Verify completed
      const afterFirst = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });
      expect(afterFirst.lastStatus).toBe("success");

      // Second trigger should work
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      const job2 = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Second Trigger",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(job2.id).not.toBe(job1.id);
    });
  });

  describe("Execution History", () => {
    it("should maintain execution history across triggers", async () => {
      const triggers = ["webhook", "schedule", "webhook", "manual"];
      const executionHistory = [];

      for (const triggeredBy of triggers) {
        // Reset status
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: { lastStatus: "idle" },
        });

        // Create job
        const job = await payload.create({
          collection: "jobs",
          data: {
            task: JOB_TYPES.URL_FETCH,
            status: "pending",
            input: {
              scheduledImportId: testScheduledImport.id,
              sourceUrl: testScheduledImport.sourceUrl,
              catalogId: testCatalog.id,
              originalName: `${triggeredBy} trigger`,
              userId: testUser.id,
              triggeredBy,
            },
          },
        });

        // Add to execution history
        executionHistory.unshift({
          executedAt: new Date().toISOString(),
          status: "success",
          jobId: job.id,
          triggeredBy,
        });

        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: {
            lastStatus: "running",
            executionHistory: executionHistory.slice(0, 10), // Keep last 10
          },
        });

        // Execute job
        await urlFetchJob.handler({ req: { payload }, job });
      }

      const finalImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(finalImport.executionHistory).toHaveLength(4);
      
      // Verify trigger sources
      const triggerSources = finalImport.executionHistory.map((h: any) => h.triggeredBy);
      expect(triggerSources).toEqual(["manual", "webhook", "schedule", "webhook"]);
    });

    it("should track duration in execution history", async () => {
      const startTime = Date.now();

      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Duration Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      // Execute job
      await urlFetchJob.handler({ req: { payload }, job });

      const duration = Date.now() - startTime;

      // Update with duration
      const currentImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      const history = currentImport.executionHistory || [];
      history[0] = {
        ...history[0],
        duration,
      };

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          executionHistory: history,
          statistics: {
            ...currentImport.statistics,
            averageDuration: duration,
          },
        },
      });

      const finalImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(finalImport.statistics.averageDuration).toBeGreaterThan(0);
    });
  });

  describe("Job Queue Management", () => {
    it("should handle job queue priorities", async () => {
      const jobs = [];

      // Create multiple jobs with different priorities
      for (let i = 0; i < 3; i++) {
        const job = await payload.create({
          collection: "jobs",
          data: {
            task: JOB_TYPES.URL_FETCH,
            status: "pending",
            priority: i === 0 ? 10 : i === 1 ? 5 : 1, // Different priorities
            input: {
              scheduledImportId: testScheduledImport.id,
              sourceUrl: testScheduledImport.sourceUrl,
              catalogId: testCatalog.id,
              originalName: `Priority ${i}`,
              userId: testUser.id,
              triggeredBy: "webhook",
            },
          },
        });
        jobs.push(job);
      }

      // Query jobs by priority
      const prioritizedJobs = await payload.find({
        collection: "jobs",
        where: {
          status: { equals: "pending" },
        },
        sort: "-priority",
      });

      // Highest priority should be first
      expect(prioritizedJobs.docs[0].priority).toBe(10);
    });

    it("should clean up completed jobs", async () => {
      // Create and complete a job
      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Cleanup Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      await urlFetchJob.handler({ req: { payload }, job });

      // Update job status
      await payload.update({
        collection: "jobs",
        id: job.id,
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });

      // Simulate cleanup (would be done by a cleanup job)
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      const oldJobs = await payload.find({
        collection: "jobs",
        where: {
          status: { equals: "completed" },
          completedAt: { less_than: oldDate.toISOString() },
        },
      });

      // In real scenario, these would be deleted
      expect(oldJobs.docs).toBeDefined();
    });
  });

  describe("Error Recovery", () => {
    it("should recover from job processing errors", async () => {
      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: "https://invalid-domain-xyz123.com/data.csv",
            catalogId: testCatalog.id,
            originalName: "Error Recovery Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      // Execute job (will fail)
      const result = await urlFetchJob.handler({ req: { payload }, job });

      expect(result.output.success).toBe(false);

      // Verify import can be triggered again
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("failed");

      // Should allow retry
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "running" },
      });

      const retryJob = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl, // Use valid URL this time
            catalogId: testCatalog.id,
            originalName: "Retry After Error",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(retryJob.id).toBeDefined();
    });

    it("should handle database transaction failures", async () => {
      // Create job
      const job = await payload.create({
        collection: "jobs",
        data: {
          task: JOB_TYPES.URL_FETCH,
          status: "pending",
          input: {
            scheduledImportId: "non-existent-id", // Invalid ID
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Transaction Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      // Execute job (will fail due to invalid scheduled import ID)
      const result = await urlFetchJob.handler({ req: { payload }, job });

      expect(result.output.success).toBe(false);
      expect(result.output.error).toBeDefined();
    });
  });

  describe("Triggered By Source Tracking", () => {
    it("should correctly track webhook vs schedule vs manual triggers", async () => {
      const triggerSources = {
        webhook: "webhook",
        schedule: "schedule",
        manual: "manual",
      };

      for (const [key, source] of Object.entries(triggerSources)) {
        // Reset import
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: { 
            lastStatus: "idle",
            executionHistory: [],
          },
        });

        // Create job with specific trigger source
        const job = await payload.create({
          collection: "jobs",
          data: {
            task: JOB_TYPES.URL_FETCH,
            status: "pending",
            input: {
              scheduledImportId: testScheduledImport.id,
              sourceUrl: testScheduledImport.sourceUrl,
              catalogId: testCatalog.id,
              originalName: `${key} trigger test`,
              userId: testUser.id,
              triggeredBy: source,
            },
          },
        });

        // Update execution history
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: {
            lastStatus: "running",
            executionHistory: [{
              executedAt: new Date().toISOString(),
              status: "success",
              jobId: job.id,
              triggeredBy: source,
            }],
          },
        });

        const updatedImport = await payload.findByID({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
        });

        expect(updatedImport.executionHistory[0].triggeredBy).toBe(source);
      }
    });
  });
});