/**
 * Pure builder for the ECharts option object used by BeeswarmChart.
 *
 * @module
 */

import type { EChartsOption } from "echarts";

import type { ChartTheme } from "../types";
import { computeClusterSize } from "./sizing";
import type { BeeswarmDataItem, BeeswarmSeries, BeeswarmYAxisConfig } from "./types";

interface LayoutSeries extends BeeswarmSeries {
  layoutData: Array<unknown[]>;
}

const formatTooltipDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const renderTooltip = (params: unknown): string => {
  const p = params as { data?: unknown; seriesName?: string };
  if (!p.data || !Array.isArray(p.data) || p.data.length < 4) return "";
  const [, , , item] = p.data as [number, number, number, BeeswarmDataItem];
  const dateStr = formatTooltipDate(item.x);
  if (item.count) {
    const datasetLine = p.seriesName ? `<div style="opacity: 0.7;">${p.seriesName}</div>` : "";
    return `<div style="padding: 4px 8px;"><div style="font-weight: 600;">${item.count.toLocaleString()} events</div><div>${dateStr}</div>${datasetLine}</div>`;
  }
  return `
          <div style="padding: 4px 8px; max-width: 250px;">
            <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label ?? dateStr}</div>
            <div>${dateStr}</div>
            ${(item.dataset ?? p.seriesName) ? `<div style="opacity: 0.7;">${item.dataset ?? p.seriesName}</div>` : ""}
          </div>
        `;
};

export interface BuildChartOptionArgs {
  effectiveTheme: ChartTheme;
  isRowLayout: boolean;
  showLegend: boolean;
  xMin: number | undefined;
  xMax: number | undefined;
  yAxisConfig: BeeswarmYAxisConfig;
  layoutSeries: LayoutSeries[];
  dotSize: number;
  maxClusterCount: number;
  clusterMinSize: number;
  clusterMaxSize: number;
}

export const buildChartOption = ({
  effectiveTheme,
  isRowLayout,
  showLegend,
  xMin,
  xMax,
  yAxisConfig,
  layoutSeries,
  dotSize,
  maxClusterCount,
  clusterMinSize,
  clusterMaxSize,
}: BuildChartOptionArgs): EChartsOption => ({
  backgroundColor: "transparent",
  textStyle: { color: effectiveTheme.textColor },
  grid: isRowLayout
    ? { left: "15%", right: 10, bottom: 25, top: 10, containLabel: false }
    : { left: 10, right: 10, bottom: 25, top: showLegend ? 30 : 10, containLabel: false },
  xAxis: {
    type: "time",
    min: xMin,
    max: xMax,
    axisLabel: { color: effectiveTheme.textColor, fontSize: 11 },
    axisLine: { show: !isRowLayout, lineStyle: { color: effectiveTheme.axisLineColor } },
    splitLine: { show: false },
  },
  yAxis: yAxisConfig,
  tooltip: {
    trigger: "item",
    backgroundColor: effectiveTheme.tooltipBackground,
    borderColor: effectiveTheme.axisLineColor,
    textStyle: { color: effectiveTheme.tooltipForeground },
    formatter: renderTooltip,
  },
  legend: showLegend
    ? { show: true, top: 0, textStyle: { color: effectiveTheme.textColor, fontSize: 11 } }
    : { show: false },
  series: layoutSeries.map((s) => {
    const hasClusterData = s.data.some((item) => item.count != null && item.count > 0);
    return {
      type: "scatter" as const,
      name: s.name,
      symbolSize: hasClusterData
        ? (value: number[]) => {
            const item = value[3] as unknown as BeeswarmDataItem;
            if (!item?.count) return dotSize;
            return computeClusterSize(item.count, maxClusterCount, clusterMinSize, clusterMaxSize);
          }
        : dotSize,
      itemStyle: { color: s.color, opacity: hasClusterData ? 0.5 : 0.8 },
      emphasis: { itemStyle: { color: effectiveTheme.emphasisColor, opacity: 1, borderWidth: 2, borderColor: "#fff" } },
      data: s.layoutData as unknown as number[][],
    };
  }),
  animation: true,
  animationDuration: 300,
});
