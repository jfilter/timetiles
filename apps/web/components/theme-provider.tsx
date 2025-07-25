"use client";
import React from "react";

import { useTheme } from "../lib/hooks/use-theme";

export const ThemeProvider = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  // Initialize theme on mount
  useTheme();

  return <>{children}</>;
};
