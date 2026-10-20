/**
 * Tests for the per-request next-intl configuration in `i18n/request.ts`.
 *
 * @module
 * @category Unit Tests
 */
import { locale as rootLocale } from "next/root-params";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../../../i18n/config";
import requestConfig from "../../../i18n/request";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

// Outside React Server Components next-intl resolves to a stub that throws; the server build
// of getRequestConfig is the identity function.
vi.mock("next-intl/server", () => ({ getRequestConfig: <T>(create: T) => create }));
vi.mock("next/root-params", () => ({ locale: vi.fn() }));

const MESSAGES = { en, de };
// DEFAULT_LOCALE follows the environment, so the cases use whichever locale is not the default.
const OTHER_LOCALE = SUPPORTED_LOCALES.find((locale) => locale !== DEFAULT_LOCALE)!;
const DEFAULT_CONFIG = { locale: DEFAULT_LOCALE, messages: MESSAGES[DEFAULT_LOCALE] };
const OTHER_CONFIG = { locale: OTHER_LOCALE, messages: MESSAGES[OTHER_LOCALE] };

const resolve = (explicitLocale?: string) =>
  requestConfig({ locale: explicitLocale, requestLocale: Promise.resolve(undefined) });

describe("i18n request config", () => {
  beforeEach(() => {
    vi.mocked(rootLocale).mockReset();
  });

  it("prefers an explicit locale over the root param", async () => {
    vi.mocked(rootLocale).mockResolvedValue(DEFAULT_LOCALE);

    expect(await resolve(OTHER_LOCALE)).toEqual(OTHER_CONFIG);
    expect(rootLocale).not.toHaveBeenCalled();
  });

  it("falls back to the [locale] root param", async () => {
    vi.mocked(rootLocale).mockResolvedValue(OTHER_LOCALE);

    expect(await resolve()).toEqual(OTHER_CONFIG);
  });

  it("uses the default locale outside the [locale] segment", async () => {
    vi.mocked(rootLocale).mockResolvedValue(undefined);

    expect(await resolve()).toEqual(DEFAULT_CONFIG);
  });

  it("replaces an unsupported locale with the default", async () => {
    vi.mocked(rootLocale).mockResolvedValue("fr");

    expect(await resolve("fr")).toEqual(DEFAULT_CONFIG);
    expect(await resolve()).toEqual(DEFAULT_CONFIG);
  });
});
