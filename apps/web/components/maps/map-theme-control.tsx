/**
 * Map theme toggle control component.
 *
 * A compact button styled to match standard map controls that toggles
 * between light and dark themes. Positioned in the map control area.
 *
 * @module
 * @category Components
 */
"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback } from "react";

import { useTheme } from "@/lib/hooks/use-theme";

export const MapThemeControl = () => {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const Icon = resolvedTheme === "dark" ? Sun : Moon;
  const label = resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="flex h-[29px] w-[29px] items-center justify-center rounded bg-white shadow-md transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
    >
      <Icon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
    </button>
  );
};
