/**
 * Mock for next-intl and @/i18n/navigation used in component tests.
 *
 * @module
 */

import React from "react";

import en from "../../../messages/en.json";

// Mock @/i18n/navigation (locale-aware navigation primitives)
vi.mock("@/i18n/navigation", () => ({
  Link: vi.fn(({ href, children, ...props }: Record<string, unknown>) =>
    React.createElement("a", { href, ...props } as React.HTMLAttributes<HTMLAnchorElement>, children as React.ReactNode)
  ),
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  getPathname: vi.fn(({ href }: { href: string }) => href),
}));

// Mock next-intl hooks for components that use them directly
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object), useLocale: vi.fn(() => "en"), useMessages: vi.fn(() => en) };
});

// Mock next-intl/server for server component tests
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getMessages: vi.fn().mockResolvedValue(en),
  getTranslations: vi.fn().mockImplementation(async (namespace?: string) => {
    await Promise.resolve(); // satisfy require-await
    const messages = namespace ? (en as Record<string, unknown>)[namespace] : en;
    return (key: string) => (messages as Record<string, string>)?.[key] ?? key;
  }),
}));
