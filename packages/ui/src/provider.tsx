/**
 * Configuration provider for the UI library.
 *
 * Allows consuming applications to plug in their own theme resolver
 * and newsletter submission handler without coupling the UI package
 * to specific frameworks like next-themes.
 *
 * @module
 * @category Provider
 */
"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { ChartTheme } from "./components/charts/types";

/** Map point and cluster visualization colors (duplicated from chart-themes to avoid cross-build import). */
interface MapColors {
  mapPoint: string;
  mapClusterGradient: readonly [string, string, string, string, string];
  mapStroke: string;
}

interface UIConfig {
  /** Returns the current theme name ("light" | "dark"). Defaults to "light" when omitted. */
  resolveTheme?: () => string;
  /** Global newsletter submission handler. Individual components can still override via their own onSubmit prop. */
  onNewsletterSubmit?: (email: string, additionalData?: Record<string, unknown>) => Promise<void>;
  /** Override the default light chart theme (colors for ECharts). */
  lightChartTheme?: ChartTheme;
  /** Override the default dark chart theme (colors for ECharts). */
  darkChartTheme?: ChartTheme;
  /** Override map point/cluster visualization colors. */
  mapColors?: MapColors;
}

const UIContext = createContext<UIConfig>({});

const UIProvider = ({ children, ...config }: UIConfig & { children: ReactNode }) => (
  <UIContext value={config}>{children}</UIContext>
);

const useUIConfig = () => useContext(UIContext);

export { type UIConfig, UIProvider, useUIConfig };
