/**
 * Tests for beeswarm layout pure helpers.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { buildChartOption } from "../../src/components/charts/beeswarm/build-chart-option";
import {
  computeBeeswarmLayout,
  computeMergedLayoutConfig,
  computeRowLayoutConfig,
  computeXBounds,
} from "../../src/components/charts/beeswarm/layout-computation";
import { computeClusterSize, computeDotSize } from "../../src/components/charts/beeswarm/sizing";
import type { BeeswarmSeries } from "../../src/components/charts/beeswarm/types";
import { defaultLightTheme } from "../../src/lib/chart-themes";

const makeSeries = (name: string, xs: number[], color = "#000"): BeeswarmSeries => ({
  name,
  color,
  data: xs.map((x, i) => ({ x, y: 0, id: i + 1 })),
});

describe("computeDotSize", () => {
  it("returns 14 for very small datasets", () => {
    expect(computeDotSize(10)).toBe(14);
    expect(computeDotSize(49)).toBe(14);
  });

  it("returns 10 for small datasets", () => {
    expect(computeDotSize(50)).toBe(10);
    expect(computeDotSize(199)).toBe(10);
  });

  it("returns 8 for medium datasets", () => {
    expect(computeDotSize(200)).toBe(8);
    expect(computeDotSize(499)).toBe(8);
  });

  it("returns 6 for large datasets", () => {
    expect(computeDotSize(500)).toBe(6);
    expect(computeDotSize(999)).toBe(6);
  });

  it("returns 4 for very large datasets", () => {
    expect(computeDotSize(1000)).toBe(4);
    expect(computeDotSize(10000)).toBe(4);
  });
});

describe("computeClusterSize", () => {
  it("returns minSize when counts are trivial", () => {
    expect(computeClusterSize(1, 1)).toBe(10);
    expect(computeClusterSize(1, 100)).toBe(10);
    expect(computeClusterSize(50, 1)).toBe(10);
  });

  it("scales logarithmically between minSize and maxSize", () => {
    const size = computeClusterSize(100, 10000, 10, 40);
    expect(size).toBeGreaterThan(10);
    expect(size).toBeLessThan(40);
  });

  it("returns maxSize when count equals maxCount", () => {
    expect(computeClusterSize(1000, 1000, 10, 40)).toBe(40);
  });

  it("respects custom min/max sizes", () => {
    expect(computeClusterSize(1, 10, 4, 30)).toBe(4);
    expect(computeClusterSize(10, 10, 4, 30)).toBe(30);
  });
});

describe("computeBeeswarmLayout", () => {
  it("returns empty array for empty input", () => {
    expect(computeBeeswarmLayout([], 10, 1)).toEqual([]);
  });

  it("returns empty array for series with no data", () => {
    expect(computeBeeswarmLayout([{ name: "a", color: "#000", data: [] }], 10, 1)).toEqual([]);
  });

  it("produces one Y position per input point", () => {
    const series = makeSeries("s", [1, 2, 3, 4, 5]);
    const ys = computeBeeswarmLayout([series], 10, 1);
    expect(ys).toHaveLength(5);
    for (const y of ys) expect(typeof y).toBe("number");
  });

  it("aggregates points across multiple series", () => {
    const s1 = makeSeries("a", [1, 2]);
    const s2 = makeSeries("b", [3, 4, 5]);
    const ys = computeBeeswarmLayout([s1, s2], 10, 1);
    expect(ys).toHaveLength(5);
  });

  it("separates overlapping points in Y dimension", () => {
    // 10 identical x positions — force collision should spread them
    const series = makeSeries(
      "s",
      Array.from({ length: 10 }, () => 100)
    );
    const ys = computeBeeswarmLayout([series], 10, 1);
    expect(ys).toHaveLength(10);
    // At least some Y variation must exist when collisions are present
    const unique = new Set(ys.map((y) => Math.round(y * 1000)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("handles single point without error", () => {
    const ys = computeBeeswarmLayout([makeSeries("s", [42])], 10, 1);
    expect(ys).toHaveLength(1);
    expect(Number.isFinite(ys[0]!)).toBe(true);
  });

  it("handles cluster-count points (larger radii)", () => {
    const series: BeeswarmSeries = {
      name: "clusters",
      color: "#000",
      data: [
        { x: 1, y: 0, id: -1, count: 100 },
        { x: 1, y: 0, id: -2, count: 1000 },
      ],
    };
    const ys = computeBeeswarmLayout([series], 10, 1000);
    expect(ys).toHaveLength(2);
  });
});

describe("computeXBounds", () => {
  it("returns undefined bounds for empty input", () => {
    expect(computeXBounds([])).toEqual({ xMin: undefined, xMax: undefined });
  });

  it("pads small-range datasets by 5%", () => {
    const series = makeSeries("s", [100, 200]);
    const { xMin, xMax } = computeXBounds([series]);
    expect(xMin).toBeLessThan(100);
    expect(xMax).toBeGreaterThan(200);
    // pad = range * 0.05 = 5 → xMin = 95, xMax = 205
    expect(xMin).toBe(95);
    expect(xMax).toBe(205);
  });

  it("pads zero-range data with a day's worth", () => {
    const series = makeSeries("s", [1000, 1000]);
    const { xMin, xMax } = computeXBounds([series]);
    expect(xMax! - xMin!).toBe(2 * 86400000);
  });

  it("uses full range under 200 points", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    const { xMin, xMax } = computeXBounds([makeSeries("s", xs)]);
    // pad = 99 * 0.05 ≈ 4.95 → lo = 0, hi = 99
    expect(xMin).toBeLessThan(0);
    expect(xMax).toBeGreaterThan(99);
  });

  it("uses percentile clipping for 200+ points", () => {
    // With extreme outliers, percentile clipping should ignore them for 200+ points
    const core = Array.from({ length: 998 }, (_, i) => 100 + i);
    const withOutliers = [0, ...core, 100000]; // 1000 points, two extreme outliers
    const { xMin, xMax } = computeXBounds([makeSeries("s", withOutliers)]);
    // Outliers are at 0 and 100000; 2%/98% clipping excludes them
    expect(xMin).toBeGreaterThan(0);
    expect(xMax).toBeLessThan(100000);
  });

  it("does not clip outliers for small datasets (under 200 points)", () => {
    const core = Array.from({ length: 100 }, (_, i) => 100 + i);
    const withOutliers = [0, ...core, 100000];
    const { xMin, xMax } = computeXBounds([makeSeries("s", withOutliers)]);
    // Under 200, uses full range — outliers drive the bounds
    expect(xMin).toBeLessThanOrEqual(0);
    expect(xMax).toBeGreaterThanOrEqual(100000);
  });
});

describe("computeMergedLayoutConfig", () => {
  it("returns hidden axis with symmetric min/max", () => {
    const series = makeSeries("s", [1, 2, 3]);
    const { yPositions, yAxisConfig } = computeMergedLayoutConfig([series], 10, 1);
    expect(yPositions).toHaveLength(3);
    expect(yAxisConfig.type).toBe("value");
    expect(yAxisConfig.show).toBe(false);
    expect(yAxisConfig.min).toBe(-yAxisConfig.max);
  });

  it("handles empty input with default padding", () => {
    const { yPositions, yAxisConfig } = computeMergedLayoutConfig([], 10, 1);
    expect(yPositions).toEqual([]);
    // maxAbsY defaults to 1, padding = max(1*1.2, 1) = 1.2
    expect(yAxisConfig.max).toBeCloseTo(1.2);
  });
});

describe("computeRowLayoutConfig", () => {
  it("places each series in its own band", () => {
    const s1 = makeSeries("a", [1, 2, 3]);
    const s2 = makeSeries("b", [4, 5, 6]);
    const { yPositions, yAxisConfig } = computeRowLayoutConfig([s1, s2], 10, 1, defaultLightTheme);
    expect(yPositions).toHaveLength(6);
    expect(yAxisConfig.show).toBe(true);
    expect(yAxisConfig.inverse).toBe(true);
    expect(yAxisConfig.interval).toBe(100);
    // First series centered at 50, second at 150 (before scaling jitter)
    const firstBand = yPositions.slice(0, 3);
    const secondBand = yPositions.slice(3);
    const firstMean = firstBand.reduce((a, b) => a + b, 0) / firstBand.length;
    const secondMean = secondBand.reduce((a, b) => a + b, 0) / secondBand.length;
    expect(firstMean).toBeLessThan(secondMean);
  });

  it("handles zero series", () => {
    const { yPositions, yAxisConfig } = computeRowLayoutConfig([], 10, 1, defaultLightTheme);
    expect(yPositions).toEqual([]);
    expect(yAxisConfig.max).toBe(0);
  });

  it("skips empty series in y-position output", () => {
    const s1 = makeSeries("a", [1, 2]);
    const s2: BeeswarmSeries = { name: "b", color: "#000", data: [] };
    const { yPositions } = computeRowLayoutConfig([s1, s2], 10, 1, defaultLightTheme);
    // Only s1's 2 points contribute
    expect(yPositions).toHaveLength(2);
  });

  it("row label formatter returns series name at row centers", () => {
    const s1 = makeSeries("alpha", [1]);
    const s2 = makeSeries("beta", [2]);
    const { yAxisConfig } = computeRowLayoutConfig([s1, s2], 10, 1, defaultLightTheme);
    // Row centers at 50 and 150
    expect(yAxisConfig.axisLabel.formatter(50)).toBe("alpha");
    expect(yAxisConfig.axisLabel.formatter(150)).toBe("beta");
    // Out-of-range / non-center ticks yield empty
    expect(yAxisConfig.axisLabel.formatter(-50)).toBe("");
    expect(yAxisConfig.axisLabel.formatter(75)).toBe("");
  });

  it("disables splitLine when only one row exists", () => {
    const s1 = makeSeries("only", [1]);
    const { yAxisConfig } = computeRowLayoutConfig([s1], 10, 1, defaultLightTheme);
    expect(yAxisConfig.splitLine.show).toBe(false);
  });
});

describe("buildChartOption", () => {
  const baseArgs = {
    effectiveTheme: defaultLightTheme,
    isRowLayout: false,
    showLegend: false,
    xMin: 0,
    xMax: 100,
    yAxisConfig: { type: "value" as const, show: false as const, min: -1, max: 1 },
    layoutSeries: [] as Array<BeeswarmSeries & { layoutData: Array<unknown[]> }>,
    dotSize: 10,
    maxClusterCount: 1,
    clusterMinSize: 10,
    clusterMaxSize: 40,
  };

  it("emits a time x-axis with provided bounds", () => {
    const option = buildChartOption(baseArgs);
    const xAxis = option.xAxis as { type: string; min: number; max: number };
    expect(xAxis.type).toBe("time");
    expect(xAxis.min).toBe(0);
    expect(xAxis.max).toBe(100);
  });

  it("shows legend only when showLegend is true", () => {
    const withLegend = buildChartOption({ ...baseArgs, showLegend: true });
    const withoutLegend = buildChartOption(baseArgs);
    expect((withLegend.legend as { show: boolean }).show).toBe(true);
    expect((withoutLegend.legend as { show: boolean }).show).toBe(false);
  });

  it("uses a wider grid in row layout", () => {
    const rowOption = buildChartOption({ ...baseArgs, isRowLayout: true });
    const mergedOption = buildChartOption(baseArgs);
    expect((rowOption.grid as { left: string | number }).left).toBe("15%");
    expect((mergedOption.grid as { left: string | number }).left).toBe(10);
  });

  it("maps layout series into ECharts scatter entries", () => {
    const option = buildChartOption({
      ...baseArgs,
      layoutSeries: [
        {
          name: "test",
          color: "#ff0000",
          data: [{ x: 1, y: 0, id: 1 }],
          layoutData: [[1, 0, 1, { x: 1, y: 0, id: 1 }]],
        },
      ],
    });
    const series = option.series as Array<{ type: string; name: string }>;
    expect(series).toHaveLength(1);
    expect(series[0]!.type).toBe("scatter");
    expect(series[0]!.name).toBe("test");
  });

  it("uses fixed dot size when series has no cluster data", () => {
    const option = buildChartOption({
      ...baseArgs,
      dotSize: 12,
      layoutSeries: [
        { name: "plain", color: "#000", data: [{ x: 1, y: 0, id: 1 }], layoutData: [[1, 0, 1, { x: 1, y: 0, id: 1 }]] },
      ],
    });
    const series = option.series as Array<{ symbolSize: number | ((v: number[]) => number) }>;
    expect(series[0]!.symbolSize).toBe(12);
  });

  it("uses a function symbolSize when series has cluster data", () => {
    const option = buildChartOption({
      ...baseArgs,
      layoutSeries: [
        {
          name: "clusters",
          color: "#000",
          data: [{ x: 1, y: 0, id: -1, count: 100 }],
          layoutData: [[1, 0, -1, { x: 1, y: 0, id: -1, count: 100 }]],
        },
      ],
    });
    const series = option.series as Array<{ symbolSize: unknown }>;
    expect(typeof series[0]!.symbolSize).toBe("function");
  });
});
