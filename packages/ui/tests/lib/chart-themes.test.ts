/**
 * Tests for chart theme utilities.
 *
 * @module
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { EChartsOption } from "echarts";
import { describe, expect, it } from "vitest";

import { applyThemeToOption, defaultDarkTheme, defaultLightTheme } from "../../src/lib/chart-themes";

const cartographicCss = readFileSync(path.resolve(import.meta.dirname, "../../src/themes/cartographic.css"), "utf-8");

// Resolves a token (following var() references) to its oklch() value in a cartographic.css block.
const readToken = (block: ":root" | ".dark", name: string): string => {
  const selector = block === ".dark" ? String.raw`\.dark` : ":root";
  const body = new RegExp(String.raw`^${selector} \{([^}]*)\}`, "m").exec(cartographicCss)?.[1] ?? "";
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1];
  if (!value) throw new Error(`Token --${name} not found in ${block}`);
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  return reference?.[1] ? readToken(block, reference[1]) : value;
};

const oklchToLinearRgb = (value: string): [number, number, number] => {
  const [l = 0, c = 0, h = 0] = value.slice(6, -1).trim().split(/\s+/).map(Number);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((x) => x ** 3) as [number, number, number];
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    clamp(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    clamp(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  ];
};

const hexToLinearRgb = (hex: string): [number, number, number] => {
  const channel = (offset: number) => {
    const x = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
};

const contrast = (a: [number, number, number], b: [number, number, number]): number => {
  const luminance = ([r, g, bl]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each([
  { mode: "light", block: ":root", theme: defaultLightTheme },
  { mode: "dark", block: ".dark", theme: defaultDarkTheme },
] as const)("default $mode theme contrast", ({ block, theme }) => {
  it.each(["background", "card"])("text meets WCAG AA against --%s", (surface) => {
    const ratio = contrast(hexToLinearRgb(theme.textColor ?? ""), oklchToLinearRgb(readToken(block, surface)));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("tooltip text meets WCAG AA against the tooltip background", () => {
    const ratio = contrast(
      hexToLinearRgb(theme.tooltipForeground ?? ""),
      hexToLinearRgb(theme.tooltipBackground ?? "")
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("applyThemeToOption - basic application", () => {
  it("applies theme to basic chart option", () => {
    const option: EChartsOption = {
      xAxis: { type: "category" },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [1, 2, 3] }],
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(result.backgroundColor).toBe(defaultLightTheme.backgroundColor);
    expect(result.textStyle).toEqual({ color: defaultLightTheme.textColor });
  });

  it("applies axis line colors correctly", () => {
    const option: EChartsOption = { xAxis: { type: "category" }, yAxis: { type: "value" }, series: [] };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(result.xAxis).toMatchObject({
      axisLine: { lineStyle: { color: defaultLightTheme.axisLineColor } },
      axisLabel: { color: defaultLightTheme.textColor },
      splitLine: { lineStyle: { color: defaultLightTheme.splitLineColor } },
    });

    expect(result.yAxis).toMatchObject({
      axisLine: { lineStyle: { color: defaultLightTheme.axisLineColor } },
      axisLabel: { color: defaultLightTheme.textColor },
      splitLine: { lineStyle: { color: defaultLightTheme.splitLineColor } },
    });
  });

  it("preserves custom lineStyle properties like dashed type and opacity", () => {
    const option: EChartsOption = {
      xAxis: { type: "category", splitLine: { lineStyle: { opacity: 0.3 } } },
      yAxis: { type: "value", splitLine: { lineStyle: { type: "dashed" } }, axisLine: { lineStyle: { width: 2 } } },
      series: [],
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(result.xAxis).toMatchObject({
      splitLine: { lineStyle: { opacity: 0.3, color: defaultLightTheme.splitLineColor } },
    });
    expect(result.yAxis).toMatchObject({
      splitLine: { lineStyle: { type: "dashed", color: defaultLightTheme.splitLineColor } },
      axisLine: { lineStyle: { width: 2, color: defaultLightTheme.axisLineColor } },
    });
  });

  it("applies item color to series", () => {
    const option: EChartsOption = { series: [{ type: "bar", data: [1, 2, 3] }] };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(Array.isArray(result.series)).toBe(true);
    expect(Array.isArray(result.series)).toBe(true);
    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        type: "bar",
        data: [1, 2, 3],
        itemStyle: { color: defaultLightTheme.itemColor },
      });
    }
  });
});

describe("applyThemeToOption - edge cases", () => {
  it("preserves existing series data and type", () => {
    const option: EChartsOption = { series: [{ type: "line", data: [10, 20, 30], name: "Test Series" }] };

    const result = applyThemeToOption(option, defaultDarkTheme);

    expect(Array.isArray(result.series)).toBe(true);
    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({ type: "line", data: [10, 20, 30], name: "Test Series" });
    }
  });

  it("handles array itemColor correctly", () => {
    const themeWithArrayColor = { ...defaultLightTheme, itemColor: ["#ff0000", "#00ff00", "#0000ff"] };

    const option: EChartsOption = { series: [{ type: "bar", data: [1, 2, 3] }] };

    const result = applyThemeToOption(option, themeWithArrayColor);

    expect(Array.isArray(result.series)).toBe(true);
    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        itemStyle: {
          color: "#ff0000", // Should use first color from array
        },
      });
    }
  });

  it("handles non-array series gracefully", () => {
    const option: EChartsOption = { series: { type: "bar", data: [1, 2, 3] } };

    const result = applyThemeToOption(option, defaultLightTheme);

    // Should preserve non-array series
    expect(result.series).toEqual({ type: "bar", data: [1, 2, 3] });
  });

  it("preserves existing itemStyle properties", () => {
    const option: EChartsOption = {
      series: [{ type: "bar", data: [1, 2, 3], itemStyle: { borderWidth: 2, opacity: 0.8 } }],
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(Array.isArray(result.series)).toBe(true);
    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        itemStyle: { borderWidth: 2, opacity: 0.8, color: defaultLightTheme.itemColor },
      });
    }
  });
});
