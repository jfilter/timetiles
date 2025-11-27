/**
 * Provides theme context and initialization for the application.
 *
 * Uses next-themes for theme management with support for light, dark,
 * and system themes. The theme is persisted in localStorage and applied
 * via the `class` attribute on the html element for Tailwind CSS.
 *
 * @module
 * @category Components
 */
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: Readonly<ThemeProviderProps>) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
    storageKey="timetiles-theme"
  >
    {children}
  </NextThemesProvider>
);
