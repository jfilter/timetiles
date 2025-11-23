/**
 * Integration tests for the newsletter subscription API endpoint.
 *
 * Tests email validation, successful subscriptions, and rate limiting.
 * Uses TestServer to mock external newsletter service and verify HTTP calls are made.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../../../app/api/newsletter/subscribe/route";
import { resetRateLimitService } from "../../../lib/services/rate-limit-service";
import { TestServer } from "../../setup/integration/http-server";

describe.sequential("/api/newsletter/subscribe", () => {
  let payload: Payload;
  let testEnv: any;
  let mockServer: TestServer;
  let mockServerUrl: string;
  let requestsReceived: Array<{ email: string; headers: Record<string, string> }> = [];

  beforeAll(async () => {
    const { createIntegrationTestEnvironment } = await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Create mock newsletter service server
    mockServer = new TestServer();

    // Track all requests received by mock server
    mockServer.route("/subscribe", (req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        const data = JSON.parse(body);
        requestsReceived.push({
          email: data.email,
          headers: {
            authorization: req.headers.authorization ?? "",
            "content-type": req.headers["content-type"] ?? "",
          },
        });

        // Return success response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Successfully subscribed!" }));
      });
    });

    mockServerUrl = await mockServer.start();

    // Configure Settings global with mock server URL
    await payload.updateGlobal({
      slug: "settings",
      data: {
        newsletter: {
          serviceUrl: `${mockServerUrl}/subscribe`,
          authHeader: "Bearer test-token-12345",
        },
      },
    });
  });

  afterAll(async () => {
    await mockServer.stop();
    await testEnv.cleanup();
  });

  beforeEach(() => {
    // Clear received requests before each test
    requestsReceived = [];
    // Reset rate limit service to ensure clean state
    resetRateLimitService();
  });

  it("should successfully subscribe with valid email", async () => {
    const request = new NextRequest("http://localhost:3000/api/newsletter/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // eslint-disable-next-line sonarjs/no-hardcoded-ip -- Test IP address
        "x-forwarded-for": "192.168.1.1", // Unique IP for this test
      },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    const response = await POST(request, {} as any);
    const data = await response.json();

    // Verify API response
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain("subscribed");

    // Verify HTTP call was made to external service
    expect(requestsReceived.length).toBe(1);
    expect(requestsReceived[0]?.email).toBe("test@example.com");
    expect(requestsReceived[0]?.headers.authorization).toBe("Bearer test-token-12345");
    expect(requestsReceived[0]?.headers["content-type"]).toBe("application/json");
  });

  it("should reject invalid email addresses", async () => {
    const invalidEmails = ["notanemail", "missing@domain", "@example.com", ""];

    let ipSuffix = 2; // Start from .2 to avoid conflicts with other tests

    for (const email of invalidEmails) {
      const request = new NextRequest("http://localhost:3000/api/newsletter/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `192.168.1.${ipSuffix++}`, // Unique IP for each request
        },
        body: JSON.stringify({ email }),
      });

      const response = await POST(request, {} as any);
      const data = await response.json();

      // Verify validation error
      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
      expect(data.error).toMatch(/email/i);

      // Verify NO HTTP call was made (validation happens first)
      expect(requestsReceived.length).toBe(0);

      // Reset for next iteration
      requestsReceived = [];
    }
  });

  it("should enforce rate limiting on rapid requests", async () => {
    // Make 3 rapid requests from the same IP
    const requests = [
      { email: "ratelimit1@example.com" },
      { email: "ratelimit2@example.com" },
      { email: "ratelimit3@example.com" },
    ];

    const results = [];

    for (const { email } of requests) {
      const request = new NextRequest("http://localhost:3000/api/newsletter/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // eslint-disable-next-line sonarjs/no-hardcoded-ip -- Test IP address
          "x-forwarded-for": "192.168.1.100", // Same IP for all requests
        },
        body: JSON.stringify({ email }),
      });

      const response = await POST(request, {} as any);
      const data = await response.json();

      results.push({
        email,
        status: response.status,
        data,
        retryAfter: response.headers.get("Retry-After"),
      });
    }

    // First request should succeed
    expect(results[0]?.status).toBe(200);
    expect(results[0]?.data.success).toBe(true);

    // Second and third requests should be rate limited (burst limit: 1 per 10 seconds)
    expect(results[1]?.status).toBe(429);
    expect(results[1]?.data.error).toMatch(/too many requests/i);
    expect(results[1]?.retryAfter).toBeDefined();

    expect(results[2]?.status).toBe(429);
    expect(results[2]?.data.error).toMatch(/too many requests/i);

    // Verify only first request made it to external service
    expect(requestsReceived.length).toBe(1);
    expect(requestsReceived[0]?.email).toBe("ratelimit1@example.com");
  });
});
