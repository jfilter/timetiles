/**
 * Language switcher component for toggling between EN and DE.
 *
 * @module
 * @category Components
 */
"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

import type { Locale } from "@/i18n/config";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";

const LOCALE_LABELS: Record<Locale, string> = { en: "EN", de: "DE" };

export const LocaleSwitcher = () => {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const nextLocale = SUPPORTED_LOCALES.find((l) => l !== locale) ?? SUPPORTED_LOCALES[0];

  const handleSwitch = useCallback(() => {
    router.replace(pathname, { locale: nextLocale });
  }, [router, pathname, nextLocale]);

  return (
    <button
      type="button"
      onClick={handleSwitch}
      className="text-foreground/70 hover:text-foreground cursor-pointer rounded-sm px-2 py-1 font-mono text-xs font-medium tracking-wider transition-colors"
      aria-label={`Switch to ${nextLocale === "de" ? "German" : "English"}`}
    >
      {LOCALE_LABELS[nextLocale]}
    </button>
  );
};
