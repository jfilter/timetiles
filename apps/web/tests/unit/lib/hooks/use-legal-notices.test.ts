// @vitest-environment jsdom
/**
 * Unit tests for useLegalNotices hook.
 *
 * Verifies the hook includes the locale in the query key for per-locale caching.
 *
 * @module
 * @category Tests
 */

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseLocale = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({ useQuery: mockUseQuery }));
vi.mock("next-intl", () => ({ useLocale: mockUseLocale }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLegalNotices } from "@/lib/hooks/use-legal-notices";

describe("useLegalNotices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocale.mockReturnValue("en");
  });

  it("should include locale in the query key", () => {
    mockUseLocale.mockReturnValue("de");
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    useLegalNotices();

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["legal-notices", "de"] }));
  });

  it("should use different query keys for different locales", () => {
    mockUseLocale.mockReturnValue("en");
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    useLegalNotices();

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["legal-notices", "en"] }));

    mockUseLocale.mockReturnValue("de");
    useLegalNotices();

    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.objectContaining({ queryKey: ["legal-notices", "de"] }));
  });
});
