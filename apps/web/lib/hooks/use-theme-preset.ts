/**
 * Hook for managing design theme presets at runtime.
 *
 * Works independently from dark/light mode (next-themes). The preset
 * controls the color palette while dark/light controls the brightness.
 * Together they form a 2D matrix: preset × mode.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "timetiles-theme-preset";
const DEFAULT_PRESET = "cartographic";

/** Available theme presets. Each maps to a CSS class `.theme-{name}` (except the default). */
export const THEME_PRESETS = [
  { id: "cartographic", label: "Cartographic", description: "Earth-tone palette inspired by vintage maps" },
  { id: "modern", label: "Modern", description: "Clean, contemporary design with cool blue-gray tones" },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];

interface UseThemePresetReturn {
  /** Currently active preset ID */
  preset: ThemePresetId;
  /** Switch to a different preset */
  setPreset: (preset: ThemePresetId) => void;
  /** Available presets */
  presets: typeof THEME_PRESETS;
}

/**
 * Manages the active theme preset.
 *
 * - Persists selection to localStorage
 * - Applies/removes CSS class on `<html>` element
 * - Default preset ("cartographic") has no class (it's the `:root` default)
 * - Other presets add `.theme-{id}` to `<html>`
 */
export const useThemePreset = (): UseThemePresetReturn => {
  const [preset, setPresetState] = useState<ThemePresetId>(DEFAULT_PRESET);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePresetId | null;
    if (stored && THEME_PRESETS.some((p) => p.id === stored)) {
      setPresetState(stored);
      applyPresetClass(stored);
    }
  }, []);

  const setPreset = useCallback((newPreset: ThemePresetId) => {
    setPresetState(newPreset);
    localStorage.setItem(STORAGE_KEY, newPreset);
    applyPresetClass(newPreset);
  }, []);

  return { preset, setPreset, presets: THEME_PRESETS };
};

/** Apply or remove theme CSS class on <html> */
const applyPresetClass = (preset: ThemePresetId): void => {
  const html = document.documentElement;

  // Remove all theme classes
  for (const p of THEME_PRESETS) {
    if (p.id !== DEFAULT_PRESET) {
      html.classList.remove(`theme-${p.id}`);
    }
  }

  // Add the new theme class (default has no class — uses :root)
  if (preset !== DEFAULT_PRESET) {
    html.classList.add(`theme-${preset}`);
  }
};
