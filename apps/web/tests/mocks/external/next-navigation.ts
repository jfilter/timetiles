/**
 * @module
 */

import { createMockRouter } from "./router";

export const mockNextNavigation: any = {
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: vi.fn(() => createMockRouter()),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
};

// Auto-mock next/navigation
vi.mock("next/navigation", () => mockNextNavigation);
