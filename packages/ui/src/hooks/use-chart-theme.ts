/**
 * @module
 */

"use client";

import type { ChartTheme } from "../components/charts/types";
import { defaultDarkTheme, defaultLightTheme, defaultMapColors, type MapColors } from "../lib/chart-themes";
import { useUIConfig } from "../provider";

/**
 * Hook that returns the appropriate chart theme based on the current theme mode.
 *
 * Reads the theme from the UIProvider's `resolveTheme` function. When no provider
 * is present, defaults to the light theme.
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
export const useChartTheme = (): ChartTheme => {
  const { resolveTheme, lightChartTheme, darkChartTheme } = useUIConfig();
  const theme = resolveTheme?.() ?? "light";
  if (theme === "dark") return darkChartTheme ?? defaultDarkTheme;
  return lightChartTheme ?? defaultLightTheme;
};

/**
 * Hook that returns map visualization colors from UIProvider or defaults.
 *
 * @returns MapColors object for point/cluster rendering
 */
export const useMapColors = (): MapColors => {
  const { mapColors } = useUIConfig();
  return mapColors ?? defaultMapColors;
};
