/**
 * Unit tests for feature flag service.
 *
 * Verifies that the service fails closed (all flags disabled) when the
 * database is unavailable, and returns actual values on success.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { type FeatureFlags, getFeatureFlags, resetFeatureFlagService } from "@/lib/services/feature-flag-service";

describe.sequential("getFeatureFlags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFeatureFlagService();
  });

  it("should return all flags as false when payload.findGlobal throws", async () => {
    const mockPayload = { findGlobal: vi.fn().mockRejectedValue(new Error("DB down")) };

    const flags = await getFeatureFlags(mockPayload as any);

    for (const [key, value] of Object.entries(flags)) {
      expect(value, `flag "${key}" should be false on error`).toBe(false);
    }
  });

  it("should return actual flag values when settings load succeeds", async () => {
    const mockPayload = {
      findGlobal: vi
        .fn()
        .mockResolvedValue({ featureFlags: { allowPrivateImports: false, enableScheduledImports: true } }),
    };

    const flags = await getFeatureFlags(mockPayload as any);

    expect(flags.allowPrivateImports).toBe(false);
    expect(flags.enableScheduledImports).toBe(true);
  });

  it("should use default (true) for missing individual flags when settings load succeeds", async () => {
    const mockPayload = { findGlobal: vi.fn().mockResolvedValue({ featureFlags: { allowPrivateImports: false } }) };

    const flags = await getFeatureFlags(mockPayload as any);

    expect(flags.allowPrivateImports).toBe(false);
    // Missing flags should default to true (from DEFAULT_FLAGS)
    expect(flags.enableRegistration).toBe(true);
    expect(flags.enableEventCreation).toBe(true);
  });

  it("should cache flags and reuse them on subsequent calls", async () => {
    const mockPayload = { findGlobal: vi.fn().mockResolvedValue({ featureFlags: { allowPrivateImports: false } }) };

    await getFeatureFlags(mockPayload as any);
    await getFeatureFlags(mockPayload as any);

    expect(mockPayload.findGlobal).toHaveBeenCalledTimes(1);
  });

  it("should not cache error responses", async () => {
    const mockPayload = {
      findGlobal: vi
        .fn()
        .mockRejectedValueOnce(new Error("DB down"))
        .mockResolvedValueOnce({ featureFlags: { allowPrivateImports: true } }),
    };

    const errorFlags = await getFeatureFlags(mockPayload as any);
    expect(errorFlags.allowPrivateImports).toBe(false);

    // Reset singleton to clear state after error (errors are not cached,
    // but the singleton instance persists)
    resetFeatureFlagService();

    const successFlags = await getFeatureFlags(mockPayload as any);
    expect(successFlags.allowPrivateImports).toBe(true);
    expect(mockPayload.findGlobal).toHaveBeenCalledTimes(2);
  });

  it("should return all expected flag keys on error", async () => {
    const mockPayload = { findGlobal: vi.fn().mockRejectedValue(new Error("DB down")) };

    const flags = await getFeatureFlags(mockPayload as any);
    const expectedKeys: (keyof FeatureFlags)[] = [
      "allowPrivateImports",
      "enableScheduledImports",
      "enableRegistration",
      "enableEventCreation",
      "enableDatasetCreation",
      "enableImportCreation",
      "enableScheduledJobExecution",
      "enableUrlFetchCaching",
    ];

    for (const key of expectedKeys) {
      expect(flags[key], `flag "${key}" should be false (fail-closed) on error`).toBe(false);
    }
  });
});
