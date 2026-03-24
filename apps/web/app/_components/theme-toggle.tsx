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
import { useTranslations } from "next-intl";

import { useMounted, useTheme } from "@/lib/hooks/use-theme";

interface ThemeToggleProps {
  className?: string;
  iconClassName?: string;
}

export const ThemeToggle = ({
  className = "hover:bg-accent/50 flex items-center justify-center rounded p-2",
  iconClassName = "h-4 w-4",
}: ThemeToggleProps = {}) => {
  const t = useTranslations("Common");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Render placeholder during SSR/hydration to avoid mismatch
  if (!mounted) {
    return (
      <button type="button" className={className} aria-label={t("toggleTheme")}>
        <Sun className={iconClassName} />
      </button>
    );
  }

  const Icon = resolvedTheme === "dark" ? Sun : Moon;
  const label = resolvedTheme === "dark" ? t("switchToLightMode") : t("switchToDarkMode");

  return (
    <button type="button" onClick={toggleTheme} title={label} aria-label={label} className={className}>
      <Icon className={iconClassName} />
    </button>
  );
};
