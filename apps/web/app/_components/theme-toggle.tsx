/**
 * Theme toggle button component.
 *
 * A simple button that toggles between light and dark themes.
 * Uses mounted state to avoid hydration mismatch since theme
 * is stored in localStorage and unknown to the server.
 *
 * @module
 * @category Components
 */
"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useTheme } from "@/lib/hooks/use-theme";

export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only render theme-dependent UI after mounting to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  // Render placeholder during SSR/hydration to avoid mismatch
  if (!mounted) {
    return (
      <button
        type="button"
        className="hover:bg-accent/50 flex items-center justify-center rounded p-2"
        aria-label="Toggle theme"
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const Icon = resolvedTheme === "dark" ? Sun : Moon;
  const label = resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="hover:bg-accent/50 flex items-center justify-center rounded p-2"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};
