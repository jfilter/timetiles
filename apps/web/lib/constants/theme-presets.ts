/**
 * Chart and map color definitions for each theme preset.
 *
 * The default (cartographic) preset uses the built-in defaults from
 * the UI package and needs no overrides. Only non-default presets
 * are defined here.
 *
 * @module
 * @category Constants
 */
import type { ChartTheme } from "@timetiles/ui/components/charts/types";
import type { MapColors } from "@timetiles/ui/lib/chart-themes";

interface PresetThemeConfig {
  light: ChartTheme;
  dark: ChartTheme;
  map: MapColors;
}

/** Theme overrides per preset. Default (cartographic) is omitted — uses built-in defaults. */
export const PRESET_THEMES: Record<string, PresetThemeConfig> = {
  modern: {
    light: {
      backgroundColor: "transparent",
      textColor: "#1e293b",
      axisLineColor: "#1e293b40",
      splitLineColor: "#1e293b15",
      itemColor: "#4f46e5",
      tooltipBackground: "#f8fafc",
      tooltipForeground: "#1e293b",
      emphasisColor: "#3730a3",
    },
    dark: {
      backgroundColor: "transparent",
      textColor: "#e2e8f0",
      axisLineColor: "#e2e8f066",
      splitLineColor: "#e2e8f033",
      itemColor: "#818cf8",
      tooltipBackground: "#1e293b",
      tooltipForeground: "#e2e8f0",
      emphasisColor: "#6366f1",
    },
    map: {
      mapPoint: "#4f46e5",
      mapClusterGradient: ["#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4338ca"],
      mapStroke: "#ffffff",
    },
  },
};
