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

import { useMounted } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";

export const ThemePresetPicker = () => {
  const { preset, setPreset, presets } = useThemePreset();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <button type="button" className="hover:bg-accent/50 flex items-center justify-center rounded p-2">
        <Palette className="h-4 w-4" />
      </button>
    );
  }

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
      title={`Theme: ${current?.label ?? preset}. Click to switch.`}
      aria-label={`Switch theme (current: ${current?.label ?? preset})`}
      className="hover:bg-accent/50 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors"
    >
      <Palette className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{current?.label}</span>
    </button>
  );
};
