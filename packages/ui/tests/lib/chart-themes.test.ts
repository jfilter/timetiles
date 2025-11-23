/**
 * Tests for chart theme utilities.
 *
 * @module
 */
import type { EChartsOption } from "echarts";
import { describe, expect, it } from "vitest";

import { applyThemeToOption, defaultDarkTheme, defaultLightTheme } from "../../src/lib/chart-themes";

describe("defaultLightTheme", () => {
  it("has correct light theme colors", () => {
    expect(defaultLightTheme.backgroundColor).toBe("transparent");
    expect(defaultLightTheme.textColor).toBe("#404040");
    expect(defaultLightTheme.axisLineColor).toBe("#4a55684D");
    expect(defaultLightTheme.splitLineColor).toBe("#4a55681A");
    expect(defaultLightTheme.itemColor).toBe("#6495ed");
  });
});

describe("defaultDarkTheme", () => {
  it("has correct dark theme colors", () => {
    expect(defaultDarkTheme.backgroundColor).toBe("transparent");
    expect(defaultDarkTheme.textColor).toBe("#404040");
    expect(defaultDarkTheme.axisLineColor).toBe("#40404066");
    expect(defaultDarkTheme.splitLineColor).toBe("#40404033");
    expect(defaultDarkTheme.itemColor).toBe("#6495ed");
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
    const option: EChartsOption = {
      xAxis: { type: "category" },
      yAxis: { type: "value" },
      series: [],
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(result.xAxis).toMatchObject({
      axisLine: {
        lineStyle: {
          color: defaultLightTheme.axisLineColor,
        },
      },
      axisLabel: {
        color: defaultLightTheme.textColor,
      },
      splitLine: {
        lineStyle: {
          color: defaultLightTheme.splitLineColor,
        },
      },
    });

    expect(result.yAxis).toMatchObject({
      axisLine: {
        lineStyle: {
          color: defaultLightTheme.axisLineColor,
        },
      },
      axisLabel: {
        color: defaultLightTheme.textColor,
      },
      splitLine: {
        lineStyle: {
          color: defaultLightTheme.splitLineColor,
        },
      },
    });
  });

  it("applies item color to series", () => {
    const option: EChartsOption = {
      series: [{ type: "bar", data: [1, 2, 3] }],
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    expect(Array.isArray(result.series)).toBe(true);
    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        type: "bar",
        data: [1, 2, 3],
        itemStyle: {
          color: defaultLightTheme.itemColor,
        },
      });
    }
  });
});

describe("applyThemeToOption - edge cases", () => {
  it("preserves existing series data and type", () => {
    const option: EChartsOption = {
      series: [
        {
          type: "line",
          data: [10, 20, 30],
          name: "Test Series",
        },
      ],
    };

    const result = applyThemeToOption(option, defaultDarkTheme);

    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        type: "line",
        data: [10, 20, 30],
        name: "Test Series",
      });
    }
  });

  it("handles array itemColor correctly", () => {
    const themeWithArrayColor = {
      ...defaultLightTheme,
      itemColor: ["#ff0000", "#00ff00", "#0000ff"],
    };

    const option: EChartsOption = {
      series: [{ type: "bar", data: [1, 2, 3] }],
    };

    const result = applyThemeToOption(option, themeWithArrayColor);

    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        itemStyle: {
          color: "#ff0000", // Should use first color from array
        },
      });
    }
  });

  it("handles non-array series gracefully", () => {
    const option: EChartsOption = {
      series: { type: "bar", data: [1, 2, 3] },
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    // Should preserve non-array series
    expect(result.series).toEqual({ type: "bar", data: [1, 2, 3] });
  });

  it("preserves existing itemStyle properties", () => {
    const option: EChartsOption = {
      series: [
        {
          type: "bar",
          data: [1, 2, 3],
          itemStyle: {
            borderWidth: 2,
            opacity: 0.8,
          },
        },
      ],
    };

    const result = applyThemeToOption(option, defaultLightTheme);

    if (Array.isArray(result.series)) {
      expect(result.series[0]).toMatchObject({
        itemStyle: {
          borderWidth: 2,
          opacity: 0.8,
          color: defaultLightTheme.itemColor,
        },
      });
    }
  });
});
