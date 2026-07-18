/**
 * Unit tests for API route rate-limit middleware.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPayload: vi.fn(),
  getClientIdentifier: vi.fn(),
  getRateLimitService: vi.fn(),
  checkConfiguredRateLimit: vi.fn(),
  checkTrustLevelRateLimit: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: mocks.getPayload }));
vi.mock("@/lib/services/rate-limit-service", () => ({
  getClientIdentifier: mocks.getClientIdentifier,
  getRateLimitService: mocks.getRateLimitService,
}));

import { checkRateLimit } from "@/lib/middleware/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPayload.mockResolvedValue({});
    // Tests in this file run concurrently (vitest sequence.concurrent) and share
    // this module-level mock, so the client IP must be derived from each call's
    // own request (via `?ip=`) rather than mutated as shared state — otherwise
    // one test's IP override races into another. Defaults to a fixed IP.
    mocks.getClientIdentifier.mockImplementation(
      (req: Request) => new URL(req.url).searchParams.get("ip") ?? "203.0.113.1"
    );
    mocks.checkConfiguredRateLimit.mockResolvedValue({ allowed: true });
    mocks.checkTrustLevelRateLimit.mockResolvedValue({ allowed: true });
    mocks.getRateLimitService.mockReturnValue({
      checkConfiguredRateLimit: mocks.checkConfiguredRateLimit,
      checkTrustLevelRateLimit: mocks.checkTrustLevelRateLimit,
    });
  });

  it("uses the resolved keyPrefix for trust-level rate limits", async () => {
    const user = { id: 42, trustLevel: "regular" };

    const response = await checkRateLimit(new Request("http://localhost/api/test"), user as never, {
      type: "FILE_UPLOAD",
      keyPrefix: (currentUser) => `preview-upload:${currentUser!.id}`,
    });

    expect(response).toBeNull();
    expect(mocks.checkTrustLevelRateLimit).toHaveBeenCalledWith("preview-upload:42", user, "FILE_UPLOAD");
    expect(mocks.checkTrustLevelRateLimit).not.toHaveBeenCalledWith("203.0.113.1", user, "FILE_UPLOAD");
  });

  it("namespaces the default anonymous key by configName so endpoints do not share a bucket", async () => {
    await checkRateLimit(new Request("http://localhost/api/login?ip=203.0.113.1"), undefined, { configName: "LOGIN" });
    await checkRateLimit(new Request("http://localhost/api/forgot?ip=203.0.113.1"), undefined, {
      configName: "FORGOT_PASSWORD",
    });

    // Same client IP, different endpoints → distinct base keys (no collision).
    expect(mocks.checkConfiguredRateLimit).toHaveBeenCalledWith("LOGIN:203.0.113.1", expect.anything());
    expect(mocks.checkConfiguredRateLimit).toHaveBeenCalledWith("FORGOT_PASSWORD:203.0.113.1", expect.anything());
    // The bare IP (unnamespaced) must never be used as a base key.
    expect(mocks.checkConfiguredRateLimit).not.toHaveBeenCalledWith("203.0.113.1", expect.anything());
  });

  it("namespaces the default authenticated key by config so per-user buckets stay per-endpoint", async () => {
    const user = { id: 7, trustLevel: "regular" };

    await checkRateLimit(new Request("http://localhost/api/quotas"), user as never, { type: "API_GENERAL" });

    expect(mocks.checkTrustLevelRateLimit).toHaveBeenCalledWith("API_GENERAL:user:7", user, "API_GENERAL");
  });

  it("collapses unresolved production IPs into a per-config bucket, not one global unknown bucket", async () => {
    await checkRateLimit(new Request("http://localhost/api/login?ip=unknown"), undefined, { configName: "LOGIN" });
    await checkRateLimit(new Request("http://localhost/api/register?ip=unknown"), undefined, {
      configName: "REGISTRATION",
    });

    expect(mocks.checkConfiguredRateLimit).toHaveBeenCalledWith("LOGIN:unknown", expect.anything());
    expect(mocks.checkConfiguredRateLimit).toHaveBeenCalledWith("REGISTRATION:unknown", expect.anything());
    // Distinct endpoints keep distinct buckets even when the IP is unresolved.
    expect(mocks.checkConfiguredRateLimit).not.toHaveBeenCalledWith("unknown", expect.anything());
  });
});
