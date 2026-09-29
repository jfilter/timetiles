/**
 * Theme preset picker — lets users switch between design themes.
 *
 * Works alongside the dark/light toggle. The preset controls colors
 * (cartographic vs modern) while dark/light controls brightness.
 *
 * @module
 * @category Components
 */
"use client";

import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";

import { useThemePreset } from "@/lib/hooks/use-theme-preset";

// The preset store starts at the default on server and client alike, so the full button is
// hydration-safe and keeps the header actions from shifting when the page becomes interactive.
export const ThemePresetPicker = () => {
  const t = useTranslations("Common");
  const { preset, setPreset, presets } = useThemePreset();

  const cyclePreset = () => {
    const currentIndex = presets.findIndex((p) => p.id === preset);
    const nextIndex = (currentIndex + 1) % presets.length;
    setPreset(presets[nextIndex]!.id);
  };

  const current = presets.find((p) => p.id === preset);

  return (
    <button
      type="button"
      onClick={cyclePreset}
      title={`${t("theme")}: ${current?.label ?? preset}`}
      aria-label={t("toggleTheme")}
      className="hover:bg-accent/50 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors"
    >
      <Palette className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{current?.label}</span>
    </button>
  );
};
