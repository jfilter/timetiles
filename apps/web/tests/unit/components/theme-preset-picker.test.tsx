/**
 * Localized labels and interaction for the theme preset picker.
 * @module
 * @category Tests
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { ThemePresetPicker } from "@/app/_components/theme-preset-picker";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

afterEach(() => {
  cleanup();
  localStorage.removeItem("timetiles-theme-preset");
  document.documentElement.classList.remove("theme-modern");
  document.body.classList.remove("theme-modern");
});

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("ThemePresetPicker ($locale)", ({ locale, messages }) => {
  const picker = () => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemePresetPicker />
    </NextIntlClientProvider>
  );

  it("labels the server-rendered placeholder", () => {
    expect(renderToString(picker())).toContain(`aria-label="${messages.Common.toggleTheme}"`);
  });

  it("localizes the control and cycles the preset", () => {
    localStorage.setItem("timetiles-theme-preset", "cartographic");
    const { getByRole } = render(picker());
    const button = getByRole("button", { name: messages.Common.toggleTheme });
    expect(button).toHaveAttribute("title", `${messages.Common.theme}: Cartographic`);
    fireEvent.click(button);
    expect(button).toHaveAttribute("title", `${messages.Common.theme}: Modern`);
    expect(localStorage.getItem("timetiles-theme-preset")).toBe("modern");
  });
});
