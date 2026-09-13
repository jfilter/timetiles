/**
 * Shared theme presets, chart/map colors, and pre-paint initialization.
 *
 * @module
 * @category Constants
 */
import type { ChartTheme } from "@timetiles/ui/charts";
import type { MapColors } from "@timetiles/ui/lib/chart-themes";

export const THEME_PRESET_STORAGE_KEY = "timetiles-theme-preset";
export const DEFAULT_THEME_PRESET = "cartographic";

export const THEME_PRESETS = [
  { id: "cartographic", label: "Cartographic", description: "Earth-tone palette inspired by vintage maps" },
  { id: "modern", label: "Modern", description: "Clean, contemporary design with cool blue-gray tones" },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];

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
      mapClusterGradient: ["#ddd6fe", "#a78bfa", "#7c3aed", "#5b21b6", "#3b0764"],
      mapStroke: "#ffffff",
    },
  },
};

export const THEME_PRESET_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_PRESET_STORAGE_KEY)});if(${JSON.stringify(THEME_PRESETS.filter((preset) => preset.id !== DEFAULT_THEME_PRESET).map((preset) => preset.id))}.includes(p)){document.documentElement.classList.add("theme-"+p);document.body.classList.add("theme-"+p)}}catch(e){}})()`;
