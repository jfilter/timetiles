/**
 * Theme toggle dropdown component.
 *
 * Provides a dropdown menu for switching between light, dark, and system
 * theme modes. Persists theme preference to localStorage and applies
 * appropriate CSS classes to the document root.
 *
 * @module
 * @category Components
 */
"use client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui";
import { ChevronDownIcon } from "lucide-react";
import { useCallback } from "react";

import { useTheme } from "@/lib/hooks/use-theme";

const options = [
  { value: "light" as const, label: "Light", icon: "🌞" },
  { value: "dark" as const, label: "Dark", icon: "🌚" },
  { value: "system" as const, label: "System", icon: "🖥️" },
];

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const current = options.find((o) => o.value === theme);

  const handleLightClick = useCallback(() => setTheme("light"), [setTheme]);
  const handleDarkClick = useCallback(() => setTheme("dark"), [setTheme]);
  const handleSystemClick = useCallback(() => setTheme("system"), [setTheme]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent/50 flex w-28 items-center justify-between gap-1 rounded px-3 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span>{current?.icon}</span>
            <span className="hidden truncate md:inline">{current?.label}</span>
          </span>
          <ChevronDownIcon className="ml-1 h-3 w-3 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-28">
        <DropdownMenuItem onClick={handleLightClick} className={theme === "light" ? "font-bold" : ""}>
          <span>🌞</span>
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDarkClick} className={theme === "dark" ? "font-bold" : ""}>
          <span>🌚</span>
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSystemClick} className={theme === "system" ? "font-bold" : ""}>
          <span>🖥️</span>
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
