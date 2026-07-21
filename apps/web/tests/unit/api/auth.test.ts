/**
 * Unit tests for public auth API endpoints.
 *
 * Covers registration and forgot-password routes that now queue email
 * delivery through the shared Payload jobs pipeline.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => {
  const mockCheckRateLimit = vi.fn();
  const mockIsEnabled = vi.fn();

  const mockPayload = {
    find: vi.fn(),
    findGlobal: vi.fn().mockResolvedValue({ siteName: "TimeTiles", logoLight: null }),
    create: vi.fn(),
    forgotPassword: vi.fn(),
    jobs: { queue: vi.fn().mockResolvedValue({ id: "email-job-1" }) },
  };

  return { mockPayload, mockGetPayload: vi.fn().mockResolvedValue(mockPayload), mockCheckRateLimit, mockIsEnabled };
});

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/utils/base-url", () => ({ getBaseUrl: vi.fn(() => "https://example.com") }));

// Only the service call is mocked. RATE_LIMITS stays REAL so the tests can
// assert which configured limit each route actually resolves — stub configs
// made every configName indistinguishable, so a route wired to the wrong one
// still looked correct.
vi.mock("@/lib/services/rate-limit-service", async () => {
  const { RATE_LIMITS } = await import("@/lib/constants/rate-limits");
  return {
    getClientIdentifier: vi.fn().mockReturnValue("test-client"),
    getRateLimitService: vi.fn().mockReturnValue({ checkConfiguredRateLimit: mocks.mockCheckRateLimit }),
    RATE_LIMITS,
  };
});

vi.mock("@/lib/services/feature-flag-service", () => ({
  getFeatureFlagService: vi.fn().mockReturnValue({ isEnabled: mocks.mockIsEnabled }),
}));

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { EMAIL_CONTEXTS } from "@/lib/email/send";

const { mockPayload, mockCheckRateLimit, mockIsEnabled } = mocks;

const defaultParams = { params: Promise.resolve({}) };

const createJsonRequest = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json", ...headers }),
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  mockCheckRateLimit.mockReset().mockReturnValue({ allowed: true });
  mockIsEnabled.mockReset().mockResolvedValue(true);
  mockPayload.find.mockReset().mockResolvedValue({ docs: [] });
  mockPayload.create
    .mockReset()
    .mockResolvedValue({
      id: 1,
      email: "new@example.com",
      firstName: "",
      locale: "en",
      _verificationToken: "verify-token-123",
    });
  mockPayload.forgotPassword.mockReset().mockResolvedValue("reset-token-123");
  mockPayload.jobs.queue.mockReset().mockResolvedValue({ id: "email-job-1" });
});

describe.sequential("POST /api/auth/register", () => {
  it("creates a user with direct verification email disabled and queues verification instead", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      { email: "new@example.com", password: "test-password-123" },
      { "x-forwarded-for": "127.0.0.1" }
    );

    const response = await registerPOST(req, defaultParams);

    expect(response.status).toBe(200);
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "users",
        disableVerificationEmail: true,
        showHiddenFields: true,
        data: expect.objectContaining({
          email: "new@example.com",
          password: "test-password-123",
          role: "user",
          registrationSource: "self",
          isActive: true,
        }),
      })
    );
    expect(mockPayload.jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "send-email",
        input: expect.objectContaining({ to: "new@example.com", context: EMAIL_CONTEXTS.ACCOUNT_VERIFICATION }),
        meta: expect.objectContaining({ context: EMAIL_CONTEXTS.ACCOUNT_VERIFICATION }),
      })
    );
  });

  it("keeps the anti-enumeration path and queues the account-exists notice for known emails", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [{ id: 2, email: "existing@example.com", locale: "en" }] });

    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      { email: "existing@example.com", password: "test-password-123" },
      { "x-forwarded-for": "127.0.0.1" }
    );

    const response = await registerPOST(req, defaultParams);

    expect(response.status).toBe(200);
    expect(mockPayload.create).not.toHaveBeenCalled();
    expect(mockPayload.jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ to: "existing@example.com", context: EMAIL_CONTEXTS.ACCOUNT_EXISTS }),
      })
    );
  });

  it("handles unique-violation race on create by queueing the account-exists email", async () => {
    // Regression: the try/catch at route.ts:125-150 recovers from a race
    // where the email passes the pre-flight `find` but `create` fails with
    // a unique-constraint violation. Without re-queueing the account-exists
    // email, the request-volume difference between racing/non-racing emails
    // would become an enumeration side-channel.
    //
    // First find: no user (passes the pre-flight check).
    // payload.create: rejects with a unique-violation error message.
    // Second find (race re-query): returns the now-existing user row.
    mockPayload.find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 42, email: "race@example.com", locale: "en" }] });
    mockPayload.create.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "users_email_idx"')
    );

    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      { email: "race@example.com", password: "test-password-123" },
      { "x-forwarded-for": "127.0.0.1" }
    );

    const response = await registerPOST(req, defaultParams);
    const data = await response.json();

    // Generic success response preserves enumeration defense.
    expect(response.status).toBe(200);
    expect(data.message).toContain("Please check your email");

    // create was attempted once (pre-check let the request through).
    expect(mockPayload.create).toHaveBeenCalledTimes(1);

    // Account-exists email queued for the racing address, matching the
    // synchronous "email already exists" path to keep email-volume uniform.
    expect(mockPayload.jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ to: "race@example.com", context: EMAIL_CONTEXTS.ACCOUNT_EXISTS }),
      })
    );
    // Verification email is NOT queued — the user already exists, so we
    // must never send ACCOUNT_VERIFICATION in the race path.
    expect(mockPayload.jobs.queue).not.toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ context: EMAIL_CONTEXTS.ACCOUNT_VERIFICATION }) })
    );
  });
});

describe.sequential("POST /api/auth/forgot-password", () => {
  it("suppresses Payload's direct email and queues the reset email instead", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 1, email: "reset@example.com", firstName: "Ada", locale: "en" }],
    });

    const req = createJsonRequest("http://localhost/api/auth/forgot-password", { email: "reset@example.com" });

    const response = await forgotPasswordPOST(req, defaultParams);

    expect(response.status).toBe(200);
    expect(mockPayload.forgotPassword).toHaveBeenCalledWith({
      collection: "users",
      data: { email: "reset@example.com" },
      disableEmail: true,
    });
    expect(mockPayload.jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "send-email",
        input: expect.objectContaining({ to: "reset@example.com", context: EMAIL_CONTEXTS.PASSWORD_RESET }),
        meta: expect.objectContaining({ context: EMAIL_CONTEXTS.PASSWORD_RESET }),
      })
    );
  });

  it("returns the same success response for unknown emails without queueing a job", async () => {
    mockPayload.forgotPassword.mockResolvedValueOnce(null);

    const req = createJsonRequest("http://localhost/api/auth/forgot-password", { email: "missing@example.com" });

    const response = await forgotPasswordPOST(req, defaultParams);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account exists");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("resolves the route's limit from the FORGOT_PASSWORD config, not some other endpoint's", async () => {
    // The route declares `rateLimit: { configName: "FORGOT_PASSWORD" }`, and
    // the middleware resolves that name against the real RATE_LIMITS table.
    // Asserting the resolved config *identity* is what makes a mis-wired
    // configName (e.g. "REGISTRATION") fail here: a scripted allow/deny
    // sequence alone is satisfied by any configName, or none at all.
    mockCheckRateLimit.mockReset().mockReturnValue({ allowed: true });
    mockPayload.forgotPassword.mockResolvedValue(null);

    const response = await forgotPasswordPOST(
      createJsonRequest("http://localhost/api/auth/forgot-password", { email: "rl@example.com" }),
      defaultParams
    );
    expect(response.status).toBe(200);

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    const [key, config] = mockCheckRateLimit.mock.calls[0] as [string, unknown];

    // Guard the premise: these two configs must be distinguishable objects,
    // otherwise the identity assertion below would prove nothing.
    expect(RATE_LIMITS.FORGOT_PASSWORD).not.toBe(RATE_LIMITS.REGISTRATION);
    expect(config).toBe(RATE_LIMITS.FORGOT_PASSWORD);

    // The bucket key is namespaced per config so forgot-password cannot eat
    // another endpoint's budget for the same anonymous client.
    expect(key).toContain("FORGOT_PASSWORD");
  });

  it("enforces the configured FORGOT_PASSWORD burst ceiling and 429s past it", async () => {
    // Drive the scripted allow/deny sequence from the real configured burst
    // window rather than a hardcoded 3, so lowering the limit in app-config
    // without updating the route is visible here.
    const burst = RATE_LIMITS.FORGOT_PASSWORD.windows.find((window) => window.name === "burst");
    expect(burst).toBeDefined();
    const burstLimit = burst!.limit;
    expect(burstLimit).toBeGreaterThan(0);

    mockCheckRateLimit.mockReset().mockImplementation((_key: string, config: { windows: { limit: number }[] }) => {
      // Emulate the real service: count calls against the config it was
      // handed. A route wired to a laxer config gets a laxer ceiling here,
      // exactly as it would in production.
      const limit = config.windows.find((window) => (window as { name?: string }).name === "burst")?.limit ?? 0;
      const callCount = mockCheckRateLimit.mock.calls.length;
      return callCount <= limit ? { allowed: true } : { allowed: false, resetTime: Date.now() + 60_000 };
    });

    mockPayload.forgotPassword.mockResolvedValue(null);

    const buildRequest = () =>
      createJsonRequest("http://localhost/api/auth/forgot-password", { email: "rl@example.com" });

    const expectedSuccess = "If an account exists for that email, we've sent password reset instructions.";

    // Every request up to the configured ceiling succeeds with the uniform
    // non-enumerating success body.
    for (let i = 0; i < burstLimit; i++) {
      const response = await forgotPasswordPOST(buildRequest(), defaultParams);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.message).toBe(expectedSuccess);
    }

    // The next one within the burst window is rate-limited.
    const limitedResponse = await forgotPasswordPOST(buildRequest(), defaultParams);
    const limitedData = await limitedResponse.json();

    expect(limitedResponse.status).toBe(429);
    // Note: the rate-limit middleware returns `{ error: "Too many
    // requests", retryAfter }` rather than the enumeration-neutral
    // success message. Body-text uniformity across 200/429 is a separate
    // concern — this assertion simply pins the current middleware
    // behavior so future changes don't silently regress it.
    expect(limitedData.error).toContain("Too many requests");
    expect(limitedResponse.headers.get("Retry-After")).not.toBeNull();

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(burstLimit + 1);
  });
});
