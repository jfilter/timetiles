/**
 * Unit tests for rate limit trust-level parsing.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { RATE_LIMITS_BY_TRUST_LEVEL, TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { logger } from "@/lib/logger";
import { createRateLimitStore } from "@/lib/services/rate-limit/factory";
import { MemoryRateLimitStore } from "@/lib/services/rate-limit/memory-store";
import { PgRateLimitStore } from "@/lib/services/rate-limit/pg-store";
import { RateLimitService } from "@/lib/services/rate-limit-service";

describe("RateLimitService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetEnv();
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

  it("trust-level limits for UNLIMITED are more permissive than static FILE_UPLOAD config", () => {
    const staticConfig = RATE_LIMITS.FILE_UPLOAD;
    const unlimitedConfig = RATE_LIMITS_BY_TRUST_LEVEL[TRUST_LEVELS.UNLIMITED].FILE_UPLOAD;

    // Find the hourly window in each config
    const staticHourly = staticConfig.windows.find((w) => w.name === "hourly");
    const unlimitedHourly = unlimitedConfig.windows.find((w) => w.name === "hourly");

    expect(staticHourly).toBeDefined();
    expect(unlimitedHourly).toBeDefined();

    // UNLIMITED users must have higher limits than the static fallback
    // This catches the bug where endpoints use configName (static) instead of type (trust-level)
    expect(unlimitedHourly!.limit).toBeGreaterThan(staticHourly!.limit);
  });

  it("all trust levels above BASIC have higher FILE_UPLOAD limits than the static config", () => {
    const staticHourly = RATE_LIMITS.FILE_UPLOAD.windows.find((w) => w.name === "hourly")!;

    for (const level of [TRUST_LEVELS.REGULAR, TRUST_LEVELS.TRUSTED, TRUST_LEVELS.POWER_USER, TRUST_LEVELS.UNLIMITED]) {
      const trustLevelConfig = RATE_LIMITS_BY_TRUST_LEVEL[level].FILE_UPLOAD;
      const hourly = trustLevelConfig.windows.find((w) => w.name === "hourly")!;

      expect(
        hourly.limit,
        `Trust level ${level} should have higher hourly limit than static config`
      ).toBeGreaterThanOrEqual(staticHourly.limit);
    }
  });
});

describe("createRateLimitStore", () => {
  it("selects the PostgreSQL store when RATE_LIMIT_BACKEND=pg", () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "pg");
    resetEnv();

    const selection = createRateLimitStore({} as never);

    expect(selection.backend).toBe("pg");
    expect(selection.store).toBeInstanceOf(PgRateLimitStore);
  });

  it("falls back to memory and warns on invalid RATE_LIMIT_BACKEND", () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "redis");
    resetEnv();

    const warnSpy = vi.spyOn(logger, "warn");
    const selection = createRateLimitStore({} as never);

    expect(selection.backend).toBe("memory");
    expect(selection.store).toBeInstanceOf(MemoryRateLimitStore);
    expect(warnSpy).toHaveBeenCalledWith(
      { configuredBackend: "redis" },
      "Unknown RATE_LIMIT_BACKEND configured; falling back to the in-memory rate-limit store"
    );
  });
});
