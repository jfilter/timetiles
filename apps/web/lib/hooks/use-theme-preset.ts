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

import { useEffect } from "react";
import { create } from "zustand";

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

const isValidPreset = (value: string | null): value is ThemePresetId =>
  value != null && THEME_PRESETS.some((p) => p.id === value);

/**
 * Shared store for the active theme preset.
 *
 * A single module-level store is the source of truth so every consumer
 * (providers UIBridge, clustered-map, map-preferences-control, the header
 * picker) reads and writes the same value and re-renders on change. A
 * component-local `useState` would give each call site its own copy, leaving
 * JS-driven theming (ECharts themes, MapLibre tile style) stale after a switch.
 */
interface ThemePresetStore {
  preset: ThemePresetId;
  setPreset: (preset: ThemePresetId) => void;
}

const useThemePresetStore = create<ThemePresetStore>((set) => ({
  preset: DEFAULT_PRESET,
  setPreset: (newPreset: ThemePresetId) => {
    set({ preset: newPreset });
    localStorage.setItem(STORAGE_KEY, newPreset);
    applyPresetClass(newPreset);
  },
}));

/**
 * Manages the active theme preset.
 *
 * - Persists selection to localStorage
 * - Applies/removes CSS class on `<html>` element
 * - Default preset ("cartographic") has no class (it's the `:root` default)
 * - Other presets add `.theme-{id}` to `<html>`
 */
export const useThemePreset = (): UseThemePresetReturn => {
  const preset = useThemePresetStore((state) => state.preset);
  const setPreset = useThemePresetStore((state) => state.setPreset);

  // Hydrate from localStorage on mount and keep in sync across tabs.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidPreset(stored)) {
      useThemePresetStore.setState({ preset: stored });
      applyPresetClass(stored);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = isValidPreset(event.newValue) ? event.newValue : DEFAULT_PRESET;
      useThemePresetStore.setState({ preset: next });
      applyPresetClass(next);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return { preset, setPreset, presets: THEME_PRESETS };
};

/** Apply or remove theme CSS class on both <html> and <body>.
 *  Both elements need the class because next/font sets font CSS variables
 *  on <body> via generated classes — the theme must override at the same level. */
const applyPresetClass = (preset: ThemePresetId): void => {
  const targets = [document.documentElement, document.body];

  for (const el of targets) {
    // Remove all theme classes
    for (const p of THEME_PRESETS) {
      if (p.id !== DEFAULT_PRESET) {
        el.classList.remove(`theme-${p.id}`);
      }
    }

    // Add the new theme class (default has no class — uses :root)
    if (preset !== DEFAULT_PRESET) {
      el.classList.add(`theme-${preset}`);
    }
  }
};
