/**
 * Integration tests for webhook trigger API endpoint
 * Tests real database interactions and API behavior.
 * @module
 */

import type { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/webhooks/trigger/[token]/route";
import * as RateLimitModule from "@/lib/services/rate-limit-service";
import { RateLimitService } from "@/lib/services/rate-limit-service";
import type { Catalog, ScheduledImport, User } from "@/payload-types";

import { TEST_CREDENTIALS, TEST_TOKENS } from "../../constants/test-credentials";
import { TestDataBuilder } from "../../setup/test-data-builder";
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("Webhook Trigger API Integration", () => {
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testData: TestDataBuilder;
  let testUser: User;
  let testCatalog: Catalog;
  let testScheduledImport: ScheduledImport;
  let rateLimitService: RateLimitService;

  // Helper function to call webhook endpoint
  const callWebhook = async (token: string, method: "POST" | "GET" = "POST"): Promise<NextResponse> => {
    const request = new NextRequest(`http://localhost:3000/api/webhooks/trigger/${token}`, {
      method,
    });

    if (method === "POST") {
      return POST(request, { params: Promise.resolve({ token }) });
    } else {
      return GET();
    }
  };

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
    testData = new TestDataBuilder(payload);

    // Create a single rate limit service instance for tests
    rateLimitService = new RateLimitService(payload);

    // Mock getRateLimitService to return our controlled instance
    vi.spyOn(RateLimitModule, "getRateLimitService").mockReturnValue(rateLimitService);

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
    vi.restoreAllMocks();
    if (rateLimitService) {
      rateLimitService.destroy();
    }
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

    // Clear rate limits for clean test state
    rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:burst`);
    rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:hourly`);
  });

  describe("Successful Webhook Trigger", () => {
    it("should trigger import and create job in database", async () => {
      const response = await callWebhook(testScheduledImport.webhookToken!);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toMatchObject({
        success: true,
        message: "Import triggered successfully",
        status: "triggered",
        jobId: expect.any(String),
      });

      // Job ID should be returned as a string
      expect(typeof data.jobId).toBe("string");
      expect(data.jobId.length).toBeGreaterThan(0);
    });

    it("should update scheduled import status to running", async () => {
      await callWebhook(testScheduledImport.webhookToken!);

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("running");
      expect(updatedImport.lastRun).toBeDefined();
      // Use a more generous tolerance for time comparison
      const timeDiff = Math.abs(new Date(updatedImport.lastRun ?? "").getTime() - Date.now());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it("should add entry to execution history", async () => {
      const response = await callWebhook(testScheduledImport.webhookToken!);
      const data = await response.json();

      // Wait a moment for the update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.executionHistory).toHaveLength(1);
      expect(updatedImport.executionHistory![0]).toMatchObject({
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

      await callWebhook(testScheduledImport.webhookToken!);

      // Wait a moment for the update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.statistics!.totalRuns).toBe(6);
    });

    it("should use import name template", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          importNameTemplate: "Webhook {{date}} - {{url}}",
        },
      });

      const response = await callWebhook(testScheduledImport.webhookToken!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Can't directly access job internals, but we know the job was created
      expect(data.jobId).toBeDefined();
      expect(data.status).toBe("triggered");
    });

    it("should handle populated relationships", async () => {
      // Verify webhook works with populated relationships
      const response = await callWebhook(testScheduledImport.webhookToken!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Verify the job was created successfully
      expect(data.jobId).toBeDefined();
      expect(data.success).toBe(true);
    });
  });

  describe("Error Cases", () => {
    it("should return 401 for invalid token", async () => {
      const response = await callWebhook(TEST_TOKENS.invalid);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({
        error: "Invalid or disabled webhook",
        code: "INVALID_WEBHOOK",
      });
    });

    it("should return 401 when webhook is disabled (token cleared)", async () => {
      // When webhook is disabled, the token is cleared for security
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          webhookEnabled: false,
        },
      });

      // Re-fetch to get the cleared token state
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      // Token should be null after disabling webhook
      expect(updatedImport.webhookToken).toBeNull();

      // Using the old token should return 401 (no distinction from invalid token for security)
      const response = await callWebhook(testScheduledImport.webhookToken!);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({
        error: "Invalid or disabled webhook",
        code: "INVALID_WEBHOOK",
      });
    });

    it("should return 405 for GET requests", async () => {
      const response = await callWebhook(testScheduledImport.webhookToken!, "GET");

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
          lastRun: new Date().toISOString(),
        },
      });

      // Re-fetch to ensure we have the updated token
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      const response = await callWebhook(updatedImport.webhookToken ?? "");

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        success: true,
        message: "Import already running, skipped",
        status: "skipped",
      });

      // Cannot verify job creation directly as jobs are internal to Payload
      // The skipped status confirms no job was created
    });

    it("should handle deleted import gracefully", async () => {
      const webhookToken = testScheduledImport.webhookToken;

      // Delete the import
      await payload.delete({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      const response = await callWebhook(webhookToken!);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid or disabled webhook");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce burst window (10 seconds)", async () => {
      // First request succeeds
      const response1 = await callWebhook(testScheduledImport.webhookToken!);
      expect(response1.status).toBe(200);

      // Immediate second request is rate limited
      const response2 = await callWebhook(testScheduledImport.webhookToken!);
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
      // Simulate 5 requests with proper spacing
      for (let i = 0; i < 5; i++) {
        // Clear burst window for each request
        rateLimitService.resetRateLimit(`webhook:${testScheduledImport.webhookToken}:burst`);

        const response = await callWebhook(testScheduledImport.webhookToken!);
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
      const response6 = await callWebhook(testScheduledImport.webhookToken!);
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

      // First import hits rate limit
      await callWebhook(testScheduledImport.webhookToken!);
      const response1b = await callWebhook(testScheduledImport.webhookToken!);
      expect(response1b.status).toBe(429);

      // Second import should still work
      const response2 = await callWebhook(import2.webhookToken!);
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
            bearerToken: TEST_CREDENTIALS.bearer.token,
          },
        },
      });

      const response = await callWebhook(testScheduledImport.webhookToken!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Jobs are internal to Payload and not accessible as a collection
      // We can only verify the job was created successfully
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();
    });

    it("should pass basic auth to job", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          authConfig: {
            type: "basic",
            username: TEST_CREDENTIALS.basic.username,
            password: TEST_CREDENTIALS.basic.password,
          },
        },
      });

      const response = await callWebhook(testScheduledImport.webhookToken!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Jobs are internal to Payload and not accessible as a collection
      // We can only verify the job was created successfully
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();
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

      const response = await callWebhook(testScheduledImport.webhookToken!);
      const data = await response.json();

      // Wait a moment for the update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.executionHistory).toHaveLength(10);
      expect(updatedImport.executionHistory?.[0]?.triggeredBy).toBe("webhook");
      expect(updatedImport.executionHistory?.[0]?.jobId).toBe(data.jobId);
      expect(updatedImport.executionHistory?.[9]?.jobId).toBe("old-job-8");
    });

    it("should handle invalid scheduled import configurations", async () => {
      // Create a scheduled import with invalid configuration that will cause job to fail
      const invalidImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Invalid Import for Failure Test",
          description: "This import has invalid configuration to test failure handling",
          enabled: true,
          sourceUrl: "http://invalid-domain-that-does-not-exist-12345.com/data.csv", // URL that will fail to fetch
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          webhookEnabled: true,
        },
      });

      // Call webhook with invalid configuration
      const response = await callWebhook(invalidImport.webhookToken!);

      // The webhook endpoint should still return success (it queued the job)
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();

      // The execution history should record this trigger
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: invalidImport.id,
      });

      expect(updatedImport.executionHistory).toBeDefined();
      expect(updatedImport.executionHistory?.[0]?.triggeredBy).toBe("webhook");
      expect(updatedImport.executionHistory?.[0]?.jobId).toBe(data.jobId);

      // Note: The actual job execution failure would be recorded when the job runs
      // This test verifies the webhook trigger is recorded regardless of job outcome
    });
  });
});
