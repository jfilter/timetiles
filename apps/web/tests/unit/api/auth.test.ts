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

vi.mock("@/lib/services/rate-limit-service", () => ({
  getClientIdentifier: vi.fn().mockReturnValue("test-client"),
  getRateLimitService: vi.fn().mockReturnValue({ checkConfiguredRateLimit: mocks.mockCheckRateLimit }),
  RATE_LIMITS: { REGISTRATION: { windows: [] }, FORGOT_PASSWORD: { windows: [] } },
}));

vi.mock("@/lib/services/feature-flag-service", () => ({
  getFeatureFlagService: vi.fn().mockReturnValue({ isEnabled: mocks.mockIsEnabled }),
}));

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
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

    const response = await registerPOST(req, defaultParams as never);

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

    const response = await registerPOST(req, defaultParams as never);

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

    const response = await registerPOST(req, defaultParams as never);
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

    const response = await forgotPasswordPOST(req, defaultParams as never);

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

    const response = await forgotPasswordPOST(req, defaultParams as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account exists");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("wires the FORGOT_PASSWORD rate limit: 3 requests pass, the 4th returns 429", async () => {
    // Regression: commit 0496522e added a dedicated FORGOT_PASSWORD rate
    // limit config (burst=3/60s, hourly=10, daily=20) and wired the route
    // via `rateLimit: { configName: "FORGOT_PASSWORD" }`. This test confirms
    // the middleware is wired and enforces the burst ceiling.
    //
    // Unit-level strategy: the middleware delegates to the mocked
    // rate-limit service, so we simulate the burst window by returning
    // { allowed: true } three times and { allowed: false } on the 4th.
    mockCheckRateLimit
      .mockReset()
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: false, resetTime: Date.now() + 60_000 });

    mockPayload.forgotPassword.mockResolvedValue(null);

    const buildRequest = () =>
      createJsonRequest("http://localhost/api/auth/forgot-password", { email: "rl@example.com" });

    const expectedSuccess = "If an account exists for that email, we've sent password reset instructions.";

    // First three calls succeed with the uniform non-enumerating success body.
    for (let i = 0; i < 3; i++) {
      const response = await forgotPasswordPOST(buildRequest(), defaultParams as never);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.message).toBe(expectedSuccess);
    }

    // Fourth call within the burst window is rate-limited.
    const limitedResponse = await forgotPasswordPOST(buildRequest(), defaultParams as never);
    const limitedData = await limitedResponse.json();

    expect(limitedResponse.status).toBe(429);
    // Note: the rate-limit middleware returns `{ error: "Too many
    // requests", retryAfter }` rather than the enumeration-neutral
    // success message. Body-text uniformity across 200/429 is a separate
    // concern — this assertion simply pins the current middleware
    // behavior so future changes don't silently regress it.
    expect(limitedData.error).toContain("Too many requests");

    // Configured rate limit was consulted exactly 4 times with the burst config.
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(4);
  });
});
