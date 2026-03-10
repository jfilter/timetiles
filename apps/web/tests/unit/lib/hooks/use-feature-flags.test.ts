// @vitest-environment jsdom
/**
 * Unit tests for useFeatureEnabled hook.
 *
 * Verifies the hook defaults to disabled (false) during loading and on error,
 * rather than failing open with true.
 *
 * @module
 * @category Tests
 */

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({ useQuery: mockUseQuery }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFeatureEnabled } from "@/lib/hooks/use-feature-flags";

describe("useFeatureEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should default to disabled (false) when data is loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    const result = useFeatureEnabled("allowPrivateImports");

    expect(result.isEnabled).toBe(false);
    expect(result.isLoading).toBe(true);
  });

  it("should default to disabled (false) on error", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error("Failed to fetch") });

    const result = useFeatureEnabled("allowPrivateImports");

    expect(result.isEnabled).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("should return true for explicitly enabled flags", () => {
    mockUseQuery.mockReturnValue({ data: { allowPrivateImports: true }, isLoading: false, error: null });

    const result = useFeatureEnabled("allowPrivateImports");

    expect(result.isEnabled).toBe(true);
  });

  it("should return false for explicitly disabled flags", () => {
    mockUseQuery.mockReturnValue({ data: { allowPrivateImports: false }, isLoading: false, error: null });

    const result = useFeatureEnabled("allowPrivateImports");

    expect(result.isEnabled).toBe(false);
  });

  it("should return isLoading and error from the underlying query", () => {
    const testError = new Error("network failure");
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: testError });

    const result = useFeatureEnabled("enableScheduledImports");

    expect(result.isLoading).toBe(false);
    expect(result.error).toBe(testError);
  });
});
