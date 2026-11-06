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

// Only the service call is mocked. RATE_LIMITS stays real so the tests can
// assert which configured limit each route actually resolves.
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

describe("POST /api/auth/register", () => {
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
    // Regression: when `create` loses a race with a unique-constraint violation, the
    // account-exists email must still be queued, or email volume becomes an enumeration
    // side-channel. find #1: no user; create: unique violation; find #2: existing user.
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

describe("POST /api/auth/forgot-password", () => {
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
    // Asserting the resolved config *identity* catches a mis-wired configName
    // (e.g. "REGISTRATION"); a scripted allow/deny sequence alone would not.
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
    // The 429 body is the middleware's `{ error, retryAfter }`, not the
    // enumeration-neutral success message; pinned so changes are deliberate.
    expect(limitedData.error).toContain("Too many requests");
    expect(limitedResponse.headers.get("Retry-After")).not.toBeNull();

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(burstLimit + 1);
  });
});
