// @vitest-environment jsdom
/**
 * Tests for the translated mobile navigation drawer in the adaptive header.
 *
 * @module
 * @category Unit Tests
 */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdaptiveHeader } from "@/app/_components/adaptive-header";
import type { MainMenu } from "@/payload-types";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

vi.mock("@timetiles/assets/logos/latest/dark/transparent/wordmark_horizontal.svg", () => ({ default: "dark.svg" }));
vi.mock("@timetiles/assets/logos/latest/light/transparent/wordmark_horizontal.svg", () => ({ default: "light.svg" }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => "/",
}));
vi.mock("@/lib/context/site-context", () => ({ useSite: () => ({ isDefaultSite: true }) }));
vi.mock("@/lib/hooks/use-auth-queries", () => ({
  useCurrentUserQuery: () => ({ data: { user: null }, isLoading: false }),
}));
vi.mock("@/lib/hooks/use-theme", () => ({ useMounted: () => false, useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/components/locale-switcher", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/app/_components/explore-header", () => ({ ExploreFullHeader: () => null }));
vi.mock("@/app/_components/header-auth", () => ({ HeaderAuth: () => null }));
vi.mock("@/app/_components/theme-preset-picker", () => ({ ThemePresetPicker: () => null }));
vi.mock("@/app/_components/theme-toggle", () => ({ ThemeToggle: () => null }));

const mainMenu = { id: 1, navItems: [{ id: "1", label: "Explore", url: "/explore" }] } as MainMenu;

afterEach(cleanup);

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("AdaptiveHeader mobile navigation ($locale)", ({ locale, messages }) => {
  it("labels the drawer trigger, dialog and close button in the active locale", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AdaptiveHeader mainMenu={mainMenu} />
      </NextIntlClientProvider>
    );

    await user.click(screen.getByRole("button", { name: messages.Common.openNavigation }));

    const dialog = screen.getByRole("dialog", { name: messages.Common.navigation });
    expect(dialog).toHaveAccessibleDescription(messages.Common.navigationDescription);
    expect(screen.getByRole("button", { name: messages.Common.closeNavigation })).toBeInTheDocument();
  });
});
