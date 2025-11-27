/**
 * Theme hook that wraps next-themes for consistent API.
 *
 * Provides theme state and setter with proper typing for the application's
 * supported themes (light, dark, system).
 *
 * @module
 */
"use client";

import { useTheme as useNextTheme } from "next-themes";

export type Theme = "light" | "dark" | "system";

export const useTheme = () => {
  const { theme, setTheme, resolvedTheme, systemTheme } = useNextTheme();

  return {
    /** Current theme setting: "light", "dark", or "system" */
    theme: (theme ?? "system") as Theme,
    /** Set the theme */
    setTheme: setTheme as (theme: Theme) => void,
    /** The actual resolved theme after system preference is applied */
    resolvedTheme: (resolvedTheme ?? "light") as "light" | "dark",
    /** The system's preferred theme */
    systemTheme: systemTheme,
  };
};
