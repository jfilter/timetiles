"use client";

import { useTheme } from "next-themes";
import { defaultDarkTheme, defaultLightTheme } from "../lib/chart-themes";
import type { ChartTheme } from "../components/charts/types";

/**
 * Hook that returns the appropriate chart theme based on the current theme mode.
 *
 * @returns ChartTheme object (either defaultDarkTheme or defaultLightTheme)
 *
 * @example
 * ```tsx
 * function MyChart() {
 *   const chartTheme = useChartTheme();
 *   return <BarChart data={data} theme={chartTheme} />;
 * }
 * ```
 */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return theme === "dark" ? defaultDarkTheme : defaultLightTheme;
}
