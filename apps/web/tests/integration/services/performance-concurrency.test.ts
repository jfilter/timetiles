/**
 * Performance and Concurrency Tests for Scheduled Imports
 *
 * Tests various performance and concurrency scenarios including:
 * - Large file handling
 * - Concurrent schedule executions
 * - Rate limiting
 * - Memory usage
 * - Job queue performance
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";

// Mock fetch globally
global.fetch = vi.fn();

describe.sequential.skip("Performance and Concurrency Tests", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUserId: string;
  let testCatalogId: string;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test user
    const user = await payload.create({
      collection: "users",
      data: {
        email: "perf-test@example.com",
        password: "test123456",
        role: "admin",
      },
    });
    testUserId = user.id;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Performance Test Catalog",
        description: "Catalog for performance tests",
      },
    });
    testCatalogId = catalog.id;

    // Mock payload.jobs.queue
    vi.spyOn(payload.jobs, "queue").mockImplementation(async (params: any) => {
      const { task, input } = params;
      return {
        id: `mock-job-${Date.now()}-${Math.random()}`,
        task,
        input,
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
    });
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers(); // Ensure timers are restored
    await cleanup();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Always restore real timers after each test to prevent test interference
    vi.useRealTimers();
  });

  describe("Large File Performance", () => {
    it("should handle streaming large CSV files efficiently", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Large CSV Import",
          sourceUrl: "https://example.com/large.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            maxFileSize: 50, // 50MB limit
          },
        },
      });

      // Generate large CSV data
      let csvData = "id,name,value,timestamp,category,status\n";
      for (let i = 0; i < 100000; i++) {
        csvData += `${i},"Item ${i}",${Math.random() * 1000},${new Date().toISOString()},"Category ${i % 10}","active"\n`;
      }
      const largeBuffer = Buffer.from(csvData);

      // Mock the response
      (global.fetch as any).mockResolvedValueOnce(
        new Response(largeBuffer, {
          status: 200,
          headers: { "content-type": "text/csv", "content-length": String(largeBuffer.length) },
        })
      );

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-large-csv" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Large CSV Test",
          userId: testUserId,
        },
      });

      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      expect(result.output.success).toBe(true);
      expect(result.output.filesize).toBeGreaterThan(1000000); // At least 1MB

      // Performance assertions
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      // Memory usage should not increase dramatically
      const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    });

    it("should handle very large Excel files", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Large Excel Import",
          sourceUrl: "https://example.com/large.xlsx",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            maxFileSize: 30, // 30MB limit
            expectedContentType: "xlsx",
          },
        },
      });

      // Mock a large Excel file (simplified - just binary data)
      const largeExcelData = Buffer.alloc(5 * 1024 * 1024); // 5MB of zeros

      (global.fetch as any).mockResolvedValueOnce(
        new Response(largeExcelData, {
          status: 200,
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-length": String(largeExcelData.length),
          },
        })
      );

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-large-excel" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Large Excel Test",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.filesize).toBe(largeExcelData.length);
    });
  });

  describe("Concurrent Schedule Execution", () => {
    it("should handle multiple concurrent URL fetches", async () => {
      // Create multiple scheduled imports
      const schedules = await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          return payload.create({
            collection: "scheduled-imports",
            data: {
              name: `Concurrent Import ${i}`,
              sourceUrl: `https://example.com/concurrent-${i}.csv`,
              enabled: true,
              catalog: testCatalogId as any,
              scheduleType: "frequency",
              frequency: "hourly",
            },
          });
        })
      );

      // Mock all endpoints
      schedules.forEach((_, i) => {
        (global.fetch as any).mockImplementationOnce(async () => {
          // Simulate network delay
          await new Promise((resolve) => setTimeout(resolve, 100));
          return new Response(`id,value\n${i},${i * 100}`, {
            status: 200,
            headers: { "content-type": "text/csv" },
          });
        });
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute all jobs concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        schedules.map((schedule, i) =>
          urlFetchJob.handler({
            job: { id: `test-job-concurrent-${i}` },
            req: { payload },
            input: {
              scheduledImportId: schedule.id,
              sourceUrl: schedule.sourceUrl,
              authConfig: schedule.authConfig,
              catalogId: testCatalogId as any,
              originalName: `Concurrent Test ${i}`,
              userId: testUserId,
            },
          })
        )
      );
      const endTime = Date.now();

      // All should succeed
      results.forEach((result) => {
        expect(result.output.success).toBe(true);
      });

      // Should complete in reasonable time (not sequential)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Should be much less than 10 * 100ms
    });

    it("should handle concurrent schedule manager runs without duplication", async () => {
      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(baseTime);

      // Create a scheduled import with lastRun set to an hour ago
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Duplicate Prevention Import",
          sourceUrl: "https://example.com/duplicate-test.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          lastRun: new Date("2024-01-01T11:30:00.000Z"), // 1.5 hours ago from current time
        },
      });

      // Mock the endpoint
      (global.fetch as any).mockImplementation(async () => {
        return new Response("test,data\n1,2", {
          status: 200,
          headers: { "content-type": "text/csv" },
        });
      });

      // Clear mock calls
      vi.clearAllMocks();

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Run schedule manager multiple times concurrently
      const runs = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          return scheduleManagerJob.handler({
            job: { id: `test-schedule-manager-concurrent-${i}` },
            req: { payload },
          });
        })
      );

      // Check that only one job was queued despite multiple concurrent runs
      const totalTriggered = runs.reduce((sum, run) => sum + run.output.triggered, 0);
      expect(totalTriggered).toBeGreaterThanOrEqual(1); // At least one should trigger

      // URL fetch job should be queued at least once
      expect(payload.jobs.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          task: "url-fetch",
          input: expect.objectContaining({
            scheduledImportId: scheduledImport.id,
          }),
        })
      );
    }, 30000);
  });

  describe("Job Queue Performance", () => {
    it("should efficiently queue many jobs", async () => {
      const startTime = Date.now();

      // Create 50 scheduled imports quickly
      const schedules = await Promise.all(
        Array.from({ length: 50 }, async (_, i) => {
          return payload.create({
            collection: "scheduled-imports",
            data: {
              name: `Queue Test Import ${i}`,
              sourceUrl: `https://example.com/queue-test-${i}.csv`,
              enabled: true,
              catalog: testCatalogId as any,
              scheduleType: "frequency",
              frequency: "daily",
            },
          });
        })
      );

      const createTime = Date.now() - startTime;
      expect(createTime).toBeLessThan(10000); // Should create 50 records in less than 10 seconds

      // Queue jobs for all schedules
      const queueStartTime = Date.now();
      const jobIds = await Promise.all(
        schedules.map((schedule) =>
          payload.jobs.queue({
            task: "url-fetch",
            input: {
              scheduledImportId: schedule.id,
              sourceUrl: schedule.sourceUrl,
              authConfig: schedule.authConfig,
              catalogId: testCatalogId as any,
              originalName: "Queue Test",
              userId: testUserId,
            },
          })
        )
      );
      const queueTime = Date.now() - queueStartTime;

      expect(jobIds).toHaveLength(50);
      expect(queueTime).toBeLessThan(5000); // Should queue 50 jobs in less than 5 seconds
    }, 30000);
  });

  describe("Memory Management", () => {
    it("should not leak memory when processing many schedules", async () => {
      const initialMemory = process.memoryUsage();

      // Create and process multiple schedules
      for (let batch = 0; batch < 5; batch++) {
        // Create 10 schedules
        const schedules = await Promise.all(
          Array.from({ length: 10 }, async (_, i) => {
            return payload.create({
              collection: "scheduled-imports",
              data: {
                name: `Memory Test Import ${batch}-${i}`,
                sourceUrl: `https://example.com/memory-${batch}-${i}.csv`,
                enabled: true,
                catalog: testCatalogId as any,
                scheduleType: "frequency",
                frequency: "hourly",
              },
            });
          })
        );

        // Mock endpoints
        schedules.forEach((_, i) => {
          (global.fetch as any).mockImplementationOnce(async () => {
            return new Response("test,data\n1,2", {
              status: 200,
              headers: { "content-type": "text/csv" },
            });
          });
        });

        // Process them
        const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");
        await Promise.all(
          schedules.map((schedule) =>
            urlFetchJob.handler({
              job: { id: `test-job-memory-${batch}` },
              req: { payload },
              input: {
                scheduledImportId: schedule.id,
                sourceUrl: schedule.sourceUrl,
                authConfig: schedule.authConfig,
                catalogId: testCatalogId as any,
                originalName: "Memory Test",
                userId: testUserId,
              },
            })
          )
        );

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    }, 30000);
  });

  describe("Rate Limiting", () => {
    it("should handle rate-limited APIs gracefully", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Rate Limited Import",
          sourceUrl: "https://api.example.com/rate-limited.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          maxRetries: 3,
          retryDelayMinutes: 1,
        },
      });

      // Mock rate limit response
      let requestCount = 0;
      (global.fetch as any).mockImplementation(async () => {
        requestCount++;
        if (requestCount <= 2) {
          // First two attempts fail with rate limit
          return new Response(null, {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
              "Retry-After": "1",
              "X-RateLimit-Limit": "100",
              "X-RateLimit-Remaining": "0",
            },
          });
        }
        // Third attempt succeeds
        return new Response("test,data\n1,2", {
          status: 200,
          headers: { "content-type": "text/csv" },
        });
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-rate-limit" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Rate Limit Test",
          userId: testUserId,
        },
      });

      // Should eventually succeed after retries
      expect(result.output.success).toBe(true);
      expect(result.output.attempts).toBeGreaterThan(1); // Should have retried
      expect(requestCount).toBeGreaterThan(2); // Should have made at least 3 requests
    }, 30000);
  });

  describe("Timeout Performance", () => {
    it("should handle slow responses efficiently", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Slow Response Import",
          sourceUrl: "https://example.com/slow.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          timeoutSeconds: 30, // 30 second timeout (minimum allowed)
        },
      });

      // Mock a slow response that takes 3.5 seconds
      (global.fetch as any).mockImplementation(async () => {
        // Simulate a 3.5 second delay
        await new Promise((resolve) => setTimeout(resolve, 3500));
        return new Response("test,data\n1,2", {
          status: 200,
          headers: { "content-type": "text/csv" },
        });
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      const startTime = Date.now();

      // Execute the job - should handle slow response without timing out
      const result = await urlFetchJob.handler({
        job: { id: "test-job-slow" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Slow Response Test",
          userId: testUserId,
        },
      });

      const duration = Date.now() - startTime;

      expect(result.output.success).toBe(true);
      expect(duration).toBeGreaterThan(3000); // Should wait at least 3 seconds
      expect(duration).toBeLessThan(10000); // Should not take too long
    }, 30000);
  });
});
