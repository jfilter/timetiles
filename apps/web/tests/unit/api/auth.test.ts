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
  RATE_LIMITS: { REGISTRATION: { windows: [] } },
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
});
