/**
 * Combined map preferences control for language, theme preset, and dark mode.
 *
 * Single map control button that opens a popover with all display preferences.
 * Replaces the separate MapThemeControl with a unified settings panel.
 *
 * @module
 * @category Components
 */
"use client";

import { MapControlButton } from "@timetiles/ui/components/map-control-button";
import { MapControlPopover } from "@timetiles/ui/components/map-control-popover";
import { PresetButtonGroup } from "@timetiles/ui/components/preset-button-group";
import { Moon, Settings, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import type { Locale } from "@/i18n/config";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useMounted, useTheme } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";

const LOCALE_LABELS: Record<Locale, string> = { en: "EN", de: "DE" };

export const MapPreferencesControl = () => {
  const t = useTranslations("Explore");
  const tc = useTranslations("Common");
  const mounted = useMounted();
  const { resolvedTheme, setTheme } = useTheme();
  const { preset, setPreset, presets } = useThemePreset();

  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const localeOptions = SUPPORTED_LOCALES.map((l) => ({ key: l, label: LOCALE_LABELS[l] }));

  const presetOptions = presets.map((p) => ({ key: p.id, label: p.label }));

  const handleLocaleChange = useCallback(
    (newLocale: Locale) => {
      router.replace(pathname, { locale: newLocale });
    },
    [router, pathname]
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <MapControlPopover
      trigger={({ onClick }) => (
        <MapControlButton title={t("preferences")} onClick={onClick}>
          <Settings className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </MapControlButton>
      )}
    >
      {/* Language */}
      <div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{t("prefLanguage")}</div>
      <PresetButtonGroup options={localeOptions} value={locale} onChange={handleLocaleChange} className="mb-3" />

      {/* Theme preset */}
      <div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{t("prefStyle")}</div>
      <PresetButtonGroup options={presetOptions} value={preset} onChange={setPreset} className="mb-3" />

      {/* Dark mode */}
      <div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{t("prefMode")}</div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={buttonClass(!isDark)}
          aria-label={tc("switchToLightMode")}
        >
          <Sun className="mr-1 h-3 w-3" />
          {t("prefLight")}
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={buttonClass(isDark)}
          aria-label={tc("switchToDarkMode")}
        >
          <Moon className="mr-1 h-3 w-3" />
          {t("prefDark")}
        </button>
      </div>
    </MapControlPopover>
  );
};

const buttonClass = (active: boolean) =>
  [
    "flex flex-1 items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors",
    active
      ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600",
  ].join(" ");
