/**
 * Unit tests for rate limit trust-level parsing.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { RATE_LIMITS_BY_TRUST_LEVEL, TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { RateLimitService } from "@/lib/services/rate-limit-service";

describe("RateLimitService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to regular limits for malformed trust-level strings", () => {
    vi.stubEnv("NODE_ENV", "test");

    const service = new RateLimitService({} as never);

    try {
      const limits = service.getRateLimitsByTrustLevel({ trustLevel: "0x1" } as never, "FILE_UPLOAD");

      expect(limits).toEqual(RATE_LIMITS_BY_TRUST_LEVEL[TRUST_LEVELS.REGULAR].FILE_UPLOAD);
    } finally {
      service.destroy();
    }
  });
});
