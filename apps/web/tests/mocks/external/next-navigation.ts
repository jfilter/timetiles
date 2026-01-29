/**
 * @module
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockNextNavigation: any = {
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
};

// Auto-mock next/navigation
vi.mock("next/navigation", () => mockNextNavigation);
