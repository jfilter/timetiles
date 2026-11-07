/**
 * Locale-aware messages for failed requests.
 *
 * @module
 * @category Tests
 */
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider, useLocale } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/http-error";
import { useErrorMessage } from "@/lib/hooks/use-error-message";

import de from "../../../../messages/de.json";
import en from "../../../../messages/en.json";

const formatterFor = (locale: "en" | "de") => {
  const messages = locale === "en" ? en : de;
  vi.mocked(useLocale).mockReturnValue(locale);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useErrorMessage(), { wrapper }).result.current;
};

describe("useErrorMessage", () => {
  it("shows the server text in the English UI", () => {
    const format = formatterFor("en");
    expect(format(new HttpError(500, "Database is unavailable"))).toBe("Database is unavailable");
  });

  it("maps server errors to German messages instead of the English server text", () => {
    const format = formatterFor("de");
    expect(format(new HttpError(500, "Database is unavailable"))).toBe(de.Errors.serverError);
    expect(format(new HttpError(404, "Not found"))).toBe(de.Errors.notFound);
    expect(format(new HttpError(422, "Invalid sheet"), "Datei fehlerhaft")).toBe("Datei fehlerhaft");
    expect(format(new HttpError(422, "Invalid sheet"))).toBe(de.Errors.invalidRequest);
  });

  it("prefers a known error code over status overrides and server text", () => {
    const body = { error: "Password is too short", code: "password-too-short" };
    for (const locale of ["en", "de"] as const) {
      const format = formatterFor(locale);
      const message = format(new HttpError(400, body.error, body), { byStatus: { 400: "override" } });
      expect(message).not.toBe("override");
      expect(message).not.toBe(body.error);
      expect(message).toMatch(/\d/);
    }
  });

  it("explains disabled email delivery instead of a generic server error", () => {
    const body = { error: "Email delivery is disabled on this server.", code: "EMAIL_DISABLED" };
    expect(formatterFor("de")(new HttpError(503, body.error, body))).toBe(de.Errors.emailDisabled);
    expect(formatterFor("en")(new HttpError(503, body.error, body))).toBe(en.Errors.emailDisabled);
  });

  it("uses a call-site status override in every locale", () => {
    for (const locale of ["en", "de"] as const) {
      const format = formatterFor(locale);
      expect(format(new HttpError(401, "Invalid login"), { byStatus: { 401: "Wrong password" } })).toBe(
        "Wrong password"
      );
    }
  });

  it("names network failures and keeps client-authored messages", () => {
    const format = formatterFor("de");
    expect(format(new TypeError("Failed to fetch"))).toBe(de.Errors.network);
    expect(format(new Error("Die Passwörter stimmen nicht überein"))).toBe("Die Passwörter stimmen nicht überein");
    expect(format(new SyntaxError("Unexpected token <"))).toBe(de.Errors.unexpected);
  });
});
