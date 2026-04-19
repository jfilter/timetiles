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
    mocks.getClientIdentifier.mockReturnValue("203.0.113.1");
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
});
