"use client";
import React from "react";

import { useTheme } from "../lib/hooks/use-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize theme on mount
  useTheme();

  return <>{children}</>;
}
