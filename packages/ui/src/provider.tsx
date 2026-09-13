/**
 * Configuration provider for the UI library.
 *
 * Allows consuming applications to plug in their own theme resolver,
 * newsletter submission handler and translated UI texts without coupling
 * the UI package to specific frameworks like next-themes or next-intl.
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

/** Built-in texts of the UI components; apps pass translations once through UIProvider. */
interface UILabels {
  previous: string;
  next: string;
  pageOf: (page: number, total: number) => string;
  noResults: string;
  openNavigation: string;
  navigation: string;
  navigationDescription: string;
  closeNavigation: string;
  close: string;
  loading: string;
  tryAgain: string;
  confirm: string;
  cancel: string;
  updating: string;
  events: string;
  total: string;
  subscribing: string;
  subscribed: string;
  emailAddress: string;
  emptyTitle: string;
  emptySubtitle: string;
  noMatchTitle: string;
  noMatchSubtitle: string;
  errorTitle: string;
  errorSubtitle: string;
  chartNoDataSubtitle: string;
  chartNoMatchTitle: string;
  chartErrorTitle: string;
}

const DEFAULT_UI_LABELS: UILabels = {
  previous: "Previous",
  next: "Next",
  pageOf: (page, total) => `Page ${page} of ${total}`,
  noResults: "No results.",
  openNavigation: "Open navigation menu",
  navigation: "Navigation",
  navigationDescription: "Site navigation menu",
  closeNavigation: "Close navigation menu",
  close: "Close",
  loading: "Loading...",
  tryAgain: "Try again",
  confirm: "Confirm",
  cancel: "Cancel",
  updating: "Updating",
  events: "Events",
  total: "Total",
  subscribing: "Subscribing...",
  subscribed: "Subscribed",
  emailAddress: "Email address",
  emptyTitle: "No data yet",
  emptySubtitle: "There's nothing to show",
  noMatchTitle: "No matching results",
  noMatchSubtitle: "Try adjusting your filters",
  errorTitle: "Something went wrong",
  errorSubtitle: "There was a problem loading this content",
  chartNoDataSubtitle: "Import events to see visualizations",
  chartNoMatchTitle: "No matching events",
  chartErrorTitle: "Unable to load chart",
};

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
  /** Translated built-in texts; missing entries fall back to English. */
  labels?: Partial<UILabels>;
}

const UIContext = createContext<UIConfig>({});

const UIProvider = ({ children, ...config }: UIConfig & { children: ReactNode }) => (
  <UIContext value={config}>{children}</UIContext>
);

const useUIConfig = () => useContext(UIContext);

/** Built-in texts with the provider's translations applied over the English defaults. */
const useUILabels = (): UILabels => ({ ...DEFAULT_UI_LABELS, ...useContext(UIContext).labels });

export { type UIConfig, type UILabels, UIProvider, useUIConfig, useUILabels };
