/**
 * Integration tests for webhook trigger API endpoint
 * Tests real database interactions and API behavior
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import type { Catalog, Payload, ScheduledImport, User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";
import { TestDataBuilder } from "../../setup/test-data-builder";

describe("Webhook Trigger API Integration", () => {
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testData: TestDataBuilder;
  let testUser: User;
  let testCatalog: Catalog;
  let testScheduledImport: ScheduledImport;
  let webhookUrl: string;
  const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL || "http://localhost:3000";

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
    testData = new TestDataBuilder(payload);

    // Create base test data
    testUser = await testData.createUser({
      email: `webhook-api-test-${Date.now()}@example.com`,
    });

    testCatalog = await testData.createCatalog({
      name: `Webhook API Test Catalog ${Date.now()}`,
      createdBy: testUser.id,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create fresh scheduled import for each test
    testScheduledImport = await testData.createScheduledImport({
      name: `API Test Import ${Date.now()}`,
      catalog: testCatalog.id,
      createdBy: testUser.id,
      webhookEnabled: true,
      sourceUrl: "https://example.com/test-data.csv",
    });

    webhookUrl = `${baseUrl}/api/webhooks/trigger/${testScheduledImport.webhookToken}`;

    // Clear rate limits for clean test state
    const rateLimitService = getRateLimitService(payload);
    rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:burst`);
    rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:hourly`);
  });

  describe("Successful Webhook Trigger", () => {
    it("should trigger import and create job in database", async () => {
      const response = await fetch(webhookUrl, { method: "POST" });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toMatchObject({
        success: true,
        message: "Import triggered successfully",
        status: "triggered",
        jobId: expect.any(String),
      });

      // Verify job was created in database
      const job = await payload.findByID({
        collection: "jobs",
        id: data.jobId,
      });

      expect(job).toBeDefined();
      expect(job.task).toBe(JOB_TYPES.URL_FETCH);
      expect(job.input).toMatchObject({
        scheduledImportId: testScheduledImport.id,
        sourceUrl: testScheduledImport.sourceUrl,
        triggeredBy: "webhook",
        catalogId: testCatalog.id,
        userId: testUser.id,
      });
    });

    it("should update scheduled import status to running", async () => {
      await fetch(webhookUrl, { method: "POST" });

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("running");
      expect(updatedImport.lastRun).toBeDefined();
      expect(new Date(updatedImport.lastRun).getTime()).toBeCloseTo(Date.now(), -2);
    });

    it("should add entry to execution history", async () => {
      const response = await fetch(webhookUrl, { method: "POST" });
      const data = await response.json();

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.executionHistory).toHaveLength(1);
      expect(updatedImport.executionHistory[0]).toMatchObject({
        executedAt: expect.any(String),
        status: "success",
        jobId: data.jobId,
        triggeredBy: "webhook",
      });
    });

    it("should increment statistics", async () => {
      // Set initial statistics
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          statistics: {
            totalRuns: 5,
            successfulRuns: 4,
            failedRuns: 1,
            averageDuration: 1000,
          },
        },
      });

      await fetch(webhookUrl, { method: "POST" });

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.statistics.totalRuns).toBe(6);
    });

    it("should use import name template", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          importNameTemplate: "Webhook {{date}} - {{url}}",
        },
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      const data = await response.json();

      const job = await payload.findByID({
        collection: "jobs",
        id: data.jobId,
      });

      const originalName = job.input.originalName;
      expect(originalName).toMatch(/Webhook \d{4}-\d{2}-\d{2} - example\.com/);
    });

    it("should handle populated relationships", async () => {
      // Get import with populated relationships
      const populatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        depth: 2,
      });

      // Update the test import to simulate populated state
      testScheduledImport.catalog = populatedImport.catalog;
      testScheduledImport.createdBy = populatedImport.createdBy;

      const response = await fetch(webhookUrl, { method: "POST" });
      const data = await response.json();

      const job = await payload.findByID({
        collection: "jobs",
        id: data.jobId,
      });

      // Should extract IDs from populated objects
      expect(job.input.catalogId).toBe(testCatalog.id);
      expect(job.input.userId).toBe(testUser.id);
    });
  });

  describe("Error Cases", () => {
    it("should return 404 for invalid token", async () => {
      const invalidUrl = `${baseUrl}/api/webhooks/trigger/invalid_token_123456`;
      
      const response = await fetch(invalidUrl, { method: "POST" });
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toMatchObject({
        success: false,
        error: "Invalid webhook token",
      });
    });

    it("should return 403 when webhook is disabled", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          webhookEnabled: false,
        },
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data).toMatchObject({
        success: false,
        error: "Webhook is disabled for this import",
      });
    });

    it("should return 405 for GET requests", async () => {
      const response = await fetch(webhookUrl, { method: "GET" });
      
      expect(response.status).toBe(405);
      const data = await response.json();
      expect(data.error).toContain("Method not allowed");
    });

    it("should skip when import is already running", async () => {
      // Set import to running state
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          lastStatus: "running",
          lastRun: new Date(),
        },
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        success: true,
        message: "Import already running, skipped",
        status: "skipped",
      });

      // Verify no job was created
      const jobs = await payload.find({
        collection: "jobs",
        where: {
          "input.scheduledImportId": { equals: testScheduledImport.id },
        },
        sort: "-createdAt",
        limit: 1,
      });

      expect(jobs.docs).toHaveLength(0);
    });

    it("should handle deleted import gracefully", async () => {
      const webhookToken = testScheduledImport.webhookToken;
      
      // Delete the import
      await payload.delete({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Invalid webhook token");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce burst window (10 seconds)", async () => {
      // First request succeeds
      const response1 = await fetch(webhookUrl, { method: "POST" });
      expect(response1.status).toBe(200);

      // Immediate second request is rate limited
      const response2 = await fetch(webhookUrl, { method: "POST" });
      expect(response2.status).toBe(429);
      
      const data2 = await response2.json();
      expect(data2).toMatchObject({
        success: false,
        error: "Rate limit exceeded",
        limitType: "burst",
      });
      expect(data2.message).toContain("10 seconds");

      // Verify Retry-After header
      const retryAfter = response2.headers.get("Retry-After");
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(10);
    });

    it("should enforce hourly limit (5 per hour)", async () => {
      const rateLimitService = getRateLimitService(payload);
      
      // Simulate 5 requests with proper spacing
      for (let i = 0; i < 5; i++) {
        // Clear burst window for each request
        rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:burst`);
        
        const response = await fetch(webhookUrl, { method: "POST" });
        expect(response.status).toBe(200);
        
        // Update status to allow next trigger
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: { lastStatus: "success" },
        });
      }

      // Clear burst window for 6th request
      rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:burst`);
      
      // 6th request hits hourly limit
      const response6 = await fetch(webhookUrl, { method: "POST" });
      expect(response6.status).toBe(429);
      
      const data6 = await response6.json();
      expect(data6).toMatchObject({
        success: false,
        error: "Rate limit exceeded",
        limitType: "hourly",
      });
      expect(data6.message).toContain("5 requests per hour");
    });

    it("should track rate limits per token", async () => {
      // Create second import
      const import2 = await testData.createScheduledImport({
        name: "Second Import",
        catalog: testCatalog.id,
        createdBy: testUser.id,
        webhookEnabled: true,
      });

      const url2 = `${baseUrl}/api/webhooks/trigger/${import2.webhookToken}`;

      // First import hits rate limit
      await fetch(webhookUrl, { method: "POST" });
      const response1b = await fetch(webhookUrl, { method: "POST" });
      expect(response1b.status).toBe(429);

      // Second import should still work
      const response2 = await fetch(url2, { method: "POST" });
      expect(response2.status).toBe(200);
    });
  });

  describe("Authentication Configuration", () => {
    it("should pass bearer token auth to job", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          authConfig: {
            type: "bearer",
            token: "test-api-token-123",
          },
        },
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      const data = await response.json();

      const job = await payload.findByID({
        collection: "jobs",
        id: data.jobId,
      });

      expect(job.input.authConfig).toEqual({
        type: "bearer",
        token: "test-api-token-123",
      });
    });

    it("should pass basic auth to job", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          authConfig: {
            type: "basic",
            username: "testuser",
            password: "testpass",
          },
        },
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      const data = await response.json();

      const job = await payload.findByID({
        collection: "jobs",
        id: data.jobId,
      });

      expect(job.input.authConfig).toEqual({
        type: "basic",
        username: "testuser",
        password: "testpass",
      });
    });
  });

  describe("Execution History Management", () => {
    it("should limit execution history to 10 entries", async () => {
      // Create initial history
      const initialHistory = Array.from({ length: 10 }, (_, i) => ({
        executedAt: new Date(Date.now() - i * 60000).toISOString(),
        status: "success" as const,
        jobId: `old-job-${i}`,
        triggeredBy: "schedule" as const,
      }));

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          executionHistory: initialHistory,
        },
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      const data = await response.json();

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.executionHistory).toHaveLength(10);
      expect(updatedImport.executionHistory[0].triggeredBy).toBe("webhook");
      expect(updatedImport.executionHistory[0].jobId).toBe(data.jobId);
      expect(updatedImport.executionHistory[9].jobId).toBe("old-job-8");
    });

    it("should record failed webhook triggers", async () => {
      // Make job queue fail
      const originalCreate = payload.create.bind(payload);
      vi.spyOn(payload, "create").mockImplementation(async (args) => {
        if (args.collection === "jobs") {
          throw new Error("Job queue unavailable");
        }
        return originalCreate(args);
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      expect(response.status).toBe(500);

      vi.restoreAllMocks();
    });
  });

  describe("Request Validation", () => {
    it("should accept POST without body", async () => {
      const response = await fetch(webhookUrl, {
        method: "POST",
      });

      expect(response.status).toBe(200);
    });

    it("should ignore request body if provided", async () => {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          someField: "should be ignored",
        }),
      });

      expect(response.status).toBe(200);
    });

    it("should work with any content type", async () => {
      const contentTypes = [
        "application/json",
        "application/x-www-form-urlencoded",
        "text/plain",
        "multipart/form-data",
      ];

      for (const contentType of contentTypes) {
        // Reset status for each request
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: { lastStatus: "success" },
        });

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": contentType,
          },
        });

        expect(response.status).toBe(200);
      }
    });

    it("should not require authentication headers", async () => {
      const response = await fetch(webhookUrl, {
        method: "POST",
        // No auth headers
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Database Transaction Handling", () => {
    it("should handle transaction rollback on error", async () => {
      // Mock update to fail after initial status update
      let updateCount = 0;
      const originalUpdate = payload.update.bind(payload);
      
      vi.spyOn(payload, "update").mockImplementation(async (args) => {
        updateCount++;
        if (updateCount === 2) {
          // Fail on second update (execution history)
          throw new Error("Database constraint violation");
        }
        return originalUpdate(args);
      });

      const response = await fetch(webhookUrl, { method: "POST" });
      expect(response.status).toBe(500);

      // Verify status was rolled back
      const importStatus = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      // Status should not be stuck in "running"
      expect(importStatus.lastStatus).not.toBe("running");

      vi.restoreAllMocks();
    });

    it("should handle concurrent requests atomically", async () => {
      // Fire multiple requests simultaneously
      const promises = Array(5)
        .fill(null)
        .map(() => fetch(webhookUrl, { method: "POST" }));

      const responses = await Promise.all(promises);

      // Count successful triggers
      const successful = responses.filter((r) => r.status === 200);
      const successData = await Promise.all(
        successful.map((r) => r.json())
      );
      
      const triggered = successData.filter((d) => d.status === "triggered");
      const skipped = successData.filter((d) => d.status === "skipped");

      // Should have exactly 1 triggered (first one)
      expect(triggered.length).toBe(1);
      
      // Rest should be skipped or rate limited
      expect(skipped.length + responses.filter((r) => r.status === 429).length).toBe(4);

      // Verify only one job was created
      const jobs = await payload.find({
        collection: "jobs",
        where: {
          "input.scheduledImportId": { equals: testScheduledImport.id },
        },
      });

      expect(jobs.docs).toHaveLength(1);
    });
  });
});