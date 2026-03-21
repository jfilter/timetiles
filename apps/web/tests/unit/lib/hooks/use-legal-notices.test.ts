// @vitest-environment jsdom
/**
 * Unit tests for useLegalNotices hook.
 *
 * Verifies the hook returns null values while loading and includes
 * the locale in the query key for per-locale caching.
 *
 * @module
 * @category Tests
 */

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseLocale = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({ useQuery: mockUseQuery }));
vi.mock("next-intl", () => ({ useLocale: mockUseLocale }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LegalNotices } from "@/lib/hooks/use-legal-notices";
import { useLegalNotices } from "@/lib/hooks/use-legal-notices";

describe("useLegalNotices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocale.mockReturnValue("en");
  });

  it("should return undefined data while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    const result = useLegalNotices();

    expect(result.data).toBeUndefined();
    expect(result.isLoading).toBe(true);
  });

  it("should return legal notices when loaded", () => {
    const notices: LegalNotices = {
      termsUrl: "/terms",
      privacyUrl: "/privacy",
      registrationDisclaimer: "This is a demo.",
    };
    mockUseQuery.mockReturnValue({ data: notices, isLoading: false, error: null });

    const result = useLegalNotices();

    expect(result.data).toEqual(notices);
    expect(result.data?.termsUrl).toBe("/terms");
    expect(result.data?.privacyUrl).toBe("/privacy");
    expect(result.data?.registrationDisclaimer).toBe("This is a demo.");
  });

  it("should return null fields when no legal settings configured", () => {
    const emptyNotices: LegalNotices = { termsUrl: null, privacyUrl: null, registrationDisclaimer: null };
    mockUseQuery.mockReturnValue({ data: emptyNotices, isLoading: false, error: null });

    const result = useLegalNotices();

    expect(result.data?.termsUrl).toBeNull();
    expect(result.data?.privacyUrl).toBeNull();
    expect(result.data?.registrationDisclaimer).toBeNull();
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
