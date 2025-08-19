/**
 * Provides theme context and initialization for the application.
 *
 * This component wraps the application and ensures the theme is properly
 * initialized on mount using the useTheme hook. It manages dark/light
 * mode preferences and system theme detection.
 *
 * @module
 * @category Components
 */
"use client";
import type React from "react";

import { useTheme } from "../lib/hooks/use-theme";

export const ThemeProvider = ({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement => {
  // Initialize theme on mount
  useTheme();

  return children as React.ReactElement;
};
