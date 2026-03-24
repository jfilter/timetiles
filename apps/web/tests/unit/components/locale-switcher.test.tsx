/**
 * Tests for the LocaleSwitcher component.
 *
 * Verifies that the language toggle renders correctly, shows the
 * alternate locale label, and triggers navigation on click.
 *
 * @module
 * @category Tests
 */

import { useLocale } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { usePathname, useRouter } from "@/i18n/navigation";

import { LocaleSwitcher } from "../../../components/locale-switcher";
import { fireEvent, renderWithProviders, screen } from "../../setup/unit/react-render";

describe("LocaleSwitcher", () => {
  it("renders a button with the alternate locale label", () => {
    vi.mocked(useLocale).mockReturnValue("en");
    vi.mocked(usePathname).mockReturnValue("/explore");

    renderWithProviders(<LocaleSwitcher />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("DE");
    expect(button).toHaveAttribute("aria-label", "Switch to German");
  });

  it("shows EN when current locale is de", () => {
    vi.mocked(useLocale).mockReturnValue("de");
    vi.mocked(usePathname).mockReturnValue("/explore");

    renderWithProviders(<LocaleSwitcher />, { locale: "de" });

    const button = screen.getByRole("button", { name: /switch to english/i });
    expect(button).toHaveTextContent("EN");
  });

  it("calls router.replace with the new locale on click", () => {
    const mockReplace = vi.fn();
    vi.mocked(useLocale).mockReturnValue("en");
    vi.mocked(usePathname).mockReturnValue("/explore");
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    });

    const { container } = renderWithProviders(<LocaleSwitcher />);

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to German"]')!;
    expect(button).toBeTruthy();
    fireEvent.click(button);

    expect(mockReplace).toHaveBeenCalledWith("/explore", { locale: "de" });
  });
});
