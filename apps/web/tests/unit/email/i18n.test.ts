/**
 * Tests for placeholder substitution in email translations.
 *
 * Every template interpolates `t(...)` straight into markup, and the values it
 * substitutes are user-chosen — a display name, above all. Two separate ways
 * that went wrong: the value was never HTML-escaped, and it was passed to
 * `replaceAll` as a replacement STRING, where `$&` and friends are special.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { getEmailTranslations, resolveEmailLocale } from "@/lib/email/i18n";
import { formatLongDate } from "@/lib/utils/date";

describe("getEmailTranslations", () => {
  it("escapes HTML in substituted values", () => {
    const t = getEmailTranslations("en");

    const result = t("greeting", { name: '<img src=x onerror="alert(1)">' });

    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
    expect(result).toContain("&quot;");
  });

  it("escapes the ampersand without mangling ordinary names", () => {
    const t = getEmailTranslations("en");

    expect(t("greeting", { name: "Müller & Co" })).toBe("Hello Müller &amp; Co,");
  });

  // `replaceAll` with a string replacement expands `$&` to the matched text and
  // `$'` to everything after it, so a chosen name could splice the surrounding
  // message into its own output. A function replacement has no such syntax.
  it("treats dollar patterns in a value as literal text", () => {
    const t = getEmailTranslations("en");

    expect(t("greeting", { name: "$&" })).toBe("Hello $&amp;,");
    expect(t("greeting", { name: "$'" })).toBe("Hello $&#39;,");
    expect(t("greeting", { name: "$`" })).toBe("Hello $`,");
  });

  it("leaves values unescaped for plain-text contexts", () => {
    const t = getEmailTranslations("en");

    expect(t.plain("greeting", { name: "Müller & Co" })).toBe("Hello Müller & Co,");
  });

  it("still substitutes defaults and falls back to the default locale", () => {
    const t = getEmailTranslations("not-a-locale", { siteName: "TimeTiles" });

    expect(t("greeting", { name: "Max" })).toBe("Hello Max,");
  });
});

/**
 * Translating the message catalogue is only half of localizing an email. Dates
 * are formatted by the caller, and `Intl` with an undefined locale picks the
 * SERVER's — which is how German emails ended up carrying English dates.
 */
describe("resolveEmailLocale", () => {
  it("reports the locale the catalogue actually resolved to", () => {
    expect(resolveEmailLocale("de")).toBe("de");
    expect(resolveEmailLocale("not-a-locale")).toBe("en");
    expect(resolveEmailLocale(null)).toBe("en");
  });

  it("is the locale a date must be formatted in to match the message text", () => {
    const date = "2026-01-15T10:00:00.000Z";

    expect(formatLongDate(date, false, resolveEmailLocale("de"))).toContain("Januar");
    expect(formatLongDate(date, false, resolveEmailLocale("en"))).toContain("January");
  });
});
