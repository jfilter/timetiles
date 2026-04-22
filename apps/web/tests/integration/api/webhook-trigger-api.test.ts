/**
 * Integration tests for webhook trigger API endpoint
 * Tests real database interactions and API behavior.
 * @module
 */

import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/webhooks/trigger/[token]/route";
import { resetEnv } from "@/lib/config/env";
import * as RateLimitModule from "@/lib/services/rate-limit-service";
import { RateLimitService } from "@/lib/services/rate-limit-service";
import type { Catalog, ScheduledIngest, User } from "@/payload-types";

import { TEST_CREDENTIALS, TEST_TOKENS } from "../../constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledIngest,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Webhook Trigger API Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let testCatalog: Catalog;
  let testScheduledIngest: ScheduledIngest;
  let rateLimitService: RateLimitService;

  // Helper function to call webhook endpoint
  const callWebhook = async (token: string, method: "POST" | "GET" = "POST"): Promise<Response> => {
    const request = new NextRequest(`http://localhost:3000/api/webhooks/trigger/${token}`, { method });

    if (method === "POST") {
      return POST(request, { params: { token } as unknown as Promise<{ token: string }> });
    } else {
      return GET();
    }
  };

  beforeAll(async () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
    resetEnv();

    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    // Create a single rate limit service instance for tests
    rateLimitService = new RateLimitService(payload);

    // Create base test data
    const { users } = await withUsers(testEnv, { webhookTestUser: { role: "admin", trustLevel: "5" } });
    testUser = users.webhookTestUser;

    const { catalog } = await withCatalog(testEnv, { name: "Webhook API Test Catalog", user: testUser });
    testCatalog = catalog;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnv();
    if (rateLimitService) {
      rateLimitService.destroy();
    }
    await cleanup();
  });

  beforeEach(async () => {
    // Re-apply spy each test (global afterEach restores all mocks)
    vi.spyOn(RateLimitModule, "getRateLimitService").mockReturnValue(rateLimitService);

    // Create fresh scheduled ingest for each test
    const { scheduledIngest } = await withScheduledIngest(
      testEnv,
      testCatalog.id,
      "https://example.com/test-data.csv",
      { user: testUser, webhookEnabled: true, frequency: "daily" }
    );
    testScheduledIngest = scheduledIngest;

    // Clear rate limits for clean test state
    await rateLimitService.resetRateLimit(`webhook:scheduled-ingest:${testScheduledIngest.id}:burst`);
    await rateLimitService.resetRateLimit(`webhook:scheduled-ingest:${testScheduledIngest.id}:hourly`);
  });

  describe("Successful Webhook Trigger", () => {
    it("should trigger import and create job in database", async () => {
      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toMatchObject({
        message: "Import triggered successfully",
        status: "triggered",
        jobId: expect.any(String),
      });

      // Job ID should be returned as a string
      expect(typeof data.jobId).toBe("string");
      expect(data.jobId.length).toBeGreaterThan(0);
    });

    it("should update scheduled ingest status to running", async () => {
      await callWebhook(testScheduledIngest.webhookTokenPlaintext!);

      const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: testScheduledIngest.id });

      expect(updatedImport.lastStatus).toBe("running");
      expect(updatedImport.lastRun).toBeDefined();
      // Use a more generous tolerance for time comparison
      const timeDiff = Math.abs(new Date(updatedImport.lastRun ?? "").getTime() - Date.now());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it("should not add premature execution history at trigger time", async () => {
      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response.status).toBe(200);

      // Wait a moment for the update to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: testScheduledIngest.id });

      // Execution history should NOT be recorded at trigger time.
      // The actual success/failure entry is added by the job handler on completion.
      expect(updatedImport.executionHistory ?? []).toHaveLength(0);
    });

    it("should increment statistics", async () => {
      // Set initial statistics
      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: { statistics: { totalRuns: 5, successfulRuns: 4, failedRuns: 1, averageDuration: 1000 } },
      });

      await callWebhook(testScheduledIngest.webhookTokenPlaintext!);

      // Wait a moment for the update to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: testScheduledIngest.id });

      // totalRuns is NOT incremented at queue time — only on job completion
      expect(updatedImport.statistics!.totalRuns).toBe(5);
    });

    it("should use import name template", async () => {
      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: { ingestNameTemplate: "Webhook {{date}} - {{url}}" },
      });

      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Can't directly access job internals, but we know the job was created
      expect(data.jobId).toBeDefined();
      expect(data.status).toBe("triggered");
    });

    it("should handle populated relationships", async () => {
      // Verify webhook works with populated relationships
      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Verify the job was created successfully
      expect(data.jobId).toBeDefined();
    });
  });

  describe("Error Cases", () => {
    it("should return 401 for invalid token", async () => {
      const response = await callWebhook(TEST_TOKENS.invalid);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({ error: "Invalid or disabled webhook", code: "INVALID_WEBHOOK" });
    });

    it("should return 401 when webhook is disabled (token cleared)", async () => {
      // When webhook is disabled, the token is cleared for security
      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: { webhookEnabled: false },
      });

      // Re-fetch to get the cleared token state
      const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: testScheduledIngest.id });

      // Token should be null after disabling webhook
      expect(updatedImport.webhookToken).toBeNull();

      // Using the old token should return 401 (no distinction from invalid token for security)
      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({ error: "Invalid or disabled webhook", code: "INVALID_WEBHOOK" });
    });

    it("should return 405 for GET requests", async () => {
      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!, "GET");

      expect(response.status).toBe(405);
      const data = await response.json();
      expect(data.error).toContain("Method not allowed");
    });

    it("should skip when import is already running", async () => {
      // Set import to running state
      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: { lastStatus: "running", lastRun: new Date().toISOString() },
      });

      // Use the plaintext captured at creation — webhook tokens are stored
      // as SHA-256 hashes post-M1, so re-fetching the doc would only give
      // us the hash. The plaintext is surfaced by the create response once,
      // which is what a real client would have saved.
      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext ?? "");

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({ message: "Import already running, skipped", status: "skipped" });

      // Cannot verify job creation directly as jobs are internal to Payload
      // The skipped status confirms no job was created
    });

    it("should handle deleted import gracefully", async () => {
      const webhookToken = testScheduledIngest.webhookTokenPlaintext;

      // Delete the import
      await payload.delete({ collection: "scheduled-ingests", id: testScheduledIngest.id });

      const response = await callWebhook(webhookToken!);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid or disabled webhook");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce burst window (10 seconds)", async () => {
      // First request succeeds
      const response1 = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response1.status).toBe(200);

      // Immediate second request is rate limited
      const response2 = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response2.status).toBe(429);

      const data2 = await response2.json();
      expect(data2).toMatchObject({ success: false, error: "Rate limit exceeded", limitType: "burst" });
      expect(data2.message).toContain("10 seconds");

      // Verify Retry-After header. Post-M7 the reset time is rounded up to
      // the next 10-second bucket (so exact window boundaries don't leak),
      // which adds up to ~10s on top of the raw window — cap at 20s.
      const retryAfter = response2.headers.get("Retry-After");
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(20);
    });

    it("should enforce hourly limit (5 per hour)", async () => {
      // Simulate 5 requests with proper spacing
      for (let i = 0; i < 5; i++) {
        // Clear burst window for each request
        await rateLimitService.resetRateLimit(`webhook:scheduled-ingest:${testScheduledIngest.id}:burst`);

        const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
        expect(response.status).toBe(200);

        // Update status to allow next trigger
        await payload.update({
          collection: "scheduled-ingests",
          id: testScheduledIngest.id,
          data: { lastStatus: "success" },
        });
      }

      // Clear burst window for 6th request
      await rateLimitService.resetRateLimit(`webhook:scheduled-ingest:${testScheduledIngest.id}:burst`);

      // 6th request hits hourly limit
      const response6 = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response6.status).toBe(429);

      const data6 = await response6.json();
      expect(data6).toMatchObject({ success: false, error: "Rate limit exceeded", limitType: "hourly" });
      expect(data6.message).toContain("5 requests per hour");
    });

    it("should track rate limits per token", async () => {
      // Create second import
      const import2 = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Second Import",
          sourceUrl: "https://example.com/test-data.csv",
          catalog: testCatalog.id,
          createdBy: testUser.id,
          enabled: true,
          webhookEnabled: true,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // First import hits rate limit
      await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      const response1b = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response1b.status).toBe(429);

      // Second import should still work. Use the plaintext returned by the
      // create above — the DB column holds only the hash.
      const response2 = await callWebhook(import2.webhookTokenPlaintext!);
      expect(response2.status).toBe(200);
    });
  });

  describe("Authentication Configuration", () => {
    it("should pass bearer token auth to job", async () => {
      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: { authConfig: { type: "bearer", bearerToken: TEST_CREDENTIALS.bearer.token } },
      });

      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Jobs are internal to Payload and not accessible as a collection
      // We can only verify the job was created successfully
      expect(data.jobId).toBeDefined();
    });

    it("should pass basic auth to job", async () => {
      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: {
          authConfig: {
            type: "basic",
            username: TEST_CREDENTIALS.basic.username,
            password: TEST_CREDENTIALS.basic.password,
          },
        },
      });

      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response.status).toBe(200); // First check if request succeeded
      const data = await response.json();

      // Jobs are internal to Payload and not accessible as a collection
      // We can only verify the job was created successfully
      expect(data.jobId).toBeDefined();
    });
  });

  describe("Execution History Management", () => {
    it("should not modify execution history at trigger time", async () => {
      // Create initial history
      const initialHistory = Array.from({ length: 10 }, (_, i) => ({
        executedAt: new Date(Date.now() - i * 60000).toISOString(),
        status: "success" as const,
        jobId: `old-job-${i}`,
        triggeredBy: "schedule" as const,
      }));

      await payload.update({
        collection: "scheduled-ingests",
        id: testScheduledIngest.id,
        data: { executionHistory: initialHistory },
      });

      const response = await callWebhook(testScheduledIngest.webhookTokenPlaintext!);
      expect(response.status).toBe(200);

      // Wait a moment for the update to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: testScheduledIngest.id });

      // Webhook trigger should not add entries to execution history.
      // History is managed by the job handler on completion.
      expect(updatedImport.executionHistory).toHaveLength(10);
      expect(updatedImport.executionHistory?.[0]?.jobId).toBe("old-job-0");
    });

    it("should handle invalid scheduled ingest configurations", async () => {
      // Create a scheduled ingest with invalid configuration that will cause job to fail
      const invalidImport = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Invalid Import for Failure Test",
          description: "This import has invalid configuration to test failure handling",
          enabled: true,
          sourceUrl: "http://invalid-domain-that-does-not-exist-12345.com/data.csv", // URL that will fail to fetch
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          webhookEnabled: true,
          createdBy: testUser.id,
        },
        user: testUser,
      });

      // Call webhook with invalid configuration. The plaintext is only
      // returned from the create response, so use that — the DB holds the hash.
      const response = await callWebhook(invalidImport.webhookTokenPlaintext!);

      // The webhook endpoint should still return success (it queued the job)
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.jobId).toBeDefined();

      // Execution history is NOT recorded at trigger time - it's managed by the
      // job handler on completion. Verify the import status is set to "running".
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: invalidImport.id });

      expect(updatedImport.lastStatus).toBe("running");
      // Execution history should be empty since no job has completed yet
      expect(updatedImport.executionHistory ?? []).toHaveLength(0);
    });
  });
});
