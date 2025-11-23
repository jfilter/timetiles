/**
 * This file contains a custom React hook for managing the application's theme.
 *
 * The `useTheme` hook is responsible for:
 * - Reading the current theme (light, dark, or system) from the Zustand store.
 * - Applying the correct theme class to the `<html>` element.
 * - Listening for changes in the user's operating system theme preference when the
 *   "system" theme is selected, and automatically updating the UI to match.
 *
 * @module
 */
"use client";
import { useEffect, useState } from "react";

import { useUIStore } from "../store";

export const useTheme = () => {
  const theme = useUIStore((state) => state.ui.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // Resolve "system" theme to actual "light" or "dark" after hydration
  useEffect(() => {
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      setResolvedTheme(mediaQuery.matches ? "dark" : "light");
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    // Apply theme to <html> element
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    let appliedTheme = theme;
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      appliedTheme = mediaQuery.matches ? "dark" : "light";
    }

    root.classList.add(appliedTheme);
  }, [theme]);

  useEffect(() => {
    // Listen for system theme changes when theme is set to "system"
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = (e: MediaQueryListEvent) => {
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);

      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    resolvedTheme,
  };
};
