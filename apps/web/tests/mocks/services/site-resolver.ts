/**
 * Centralized site-resolver mock for unit tests.
 *
 * Returns a default site by default (isDefault: true), matching the
 * real-world scenario where at least one site is configured.
 * Tests that need to simulate non-default sites can override via:
 *
 * ```typescript
 * import { mockResolveSite } from "@/tests/mocks/services/site-resolver";
 * mockResolveSite.mockResolvedValue({ id: 2, isDefault: false });
 * ```
 *
 * @module
 * @category Tests
 */
import { vi } from "vitest";

/** The default site returned by the mock resolver. */
export const mockDefaultSite = { id: 1, name: "Default Site", slug: "default", isDefault: true };

export const mockResolveSite = vi.fn().mockResolvedValue(mockDefaultSite);

vi.mock("@/lib/services/resolution/site-resolver", () => ({
  resolveSite: mockResolveSite,
  findSiteByDomain: vi.fn().mockResolvedValue(null),
  findDefaultSite: vi.fn().mockResolvedValue(null),
  clearSiteCache: vi.fn(),
}));
