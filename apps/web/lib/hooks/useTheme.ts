"use client";
import { useEffect } from "react";
import { useUIStore } from "../store";

export function useTheme() {
  const theme = useUIStore((state) => state.ui.theme);
  const setTheme = useUIStore((state) => state.setTheme);

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
  };
}
