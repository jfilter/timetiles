/**
 * Router stub shared by the next/navigation and next-intl mocks, typed against the
 * `@/i18n/navigation` router so a field next-intl makes required fails the typecheck here.
 *
 * @module
 */

import type { useRouter } from "@/i18n/navigation";

type Router = ReturnType<typeof useRouter>;

export const createMockRouter = (overrides: Partial<Router> = {}): Router => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  bfcacheId: "test-bfcache-id",
  ...overrides,
});
