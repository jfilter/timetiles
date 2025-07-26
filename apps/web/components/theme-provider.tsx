"use client";
import type React from "react";

import { useTheme } from "../lib/hooks/use-theme";

export const ThemeProvider = ({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement => {
  // Initialize theme on mount
  useTheme();

  return children as React.ReactElement;
};
