"use client";

import type { EChartsOption } from "echarts";
import { useMemo } from "react";

import { BaseChart } from "./BaseChart";
import type { BarChartProps, BarChartDataItem } from "./types";
import {
  isValidFormatterParams,
  isValidEventParams,
  isValidDataIndex,
} from "./types";

export function BarChart({
  data,
  orientation = "vertical",
  onBarClick,
  xLabel = "",
  yLabel = "",
  title = "",
  showValues = false,
  valueFormatter = (v: number) => v.toString(),
  labelFormatter = (l: string) => l,
  maxLabelLength = 20,
  sortBy = "none",
  sortOrder = "desc",
  ...baseProps
}: BarChartProps) {
  const processedData = useMemo(() => {
    const sorted: BarChartDataItem[] = [...data];

    if (sortBy !== "none") {
      sorted.sort((a, b) => {
        const compareValue =
          sortBy === "value"
            ? a.value - b.value
            : a.label.localeCompare(b.label);
        return sortOrder === "asc" ? compareValue : -compareValue;
      });
    }

    return sorted;
  }, [data, sortBy, sortOrder]);

  const chartOption: EChartsOption = useMemo(() => {
    const isHorizontal = orientation === "horizontal";

    const truncateLabel = (label: string) => {
      if (label.length <= maxLabelLength) return label;
      return label.slice(0, maxLabelLength - 3) + "...";
    };

    const labels = processedData.map((item) =>
      truncateLabel(labelFormatter(item.label)),
    );
    const values = processedData.map((item) => item.value);
    const colors = processedData.map((item) => item.color ?? "#3b82f6");

    const baseOption: EChartsOption = {
      title: title
        ? {
            text: title,
            left: "center",
            top: 0,
          }
        : undefined,
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return "";

          const firstParam = params[0] as unknown;
          if (!isValidFormatterParams(firstParam)) return "";

          const dataIndex = firstParam.dataIndex;
          if (!isValidDataIndex(dataIndex)) return "";

          const item = processedData[dataIndex];
          if (!item) return "";

          return `
            <div style="padding: 8px;">
              <strong>${item.label}</strong><br/>
              Value: <strong>${valueFormatter(item.value)}</strong>
            </div>
          `;
        },
      },
      grid: {
        left: "10%",
        right: "5%",
        bottom: "10%",
        top: title ? "15%" : "10%",
        containLabel: true,
      },
      series: [
        {
          type: "bar" as const,
          data: values,
          itemStyle: {
            color: (params: unknown) => {
              if (!isValidFormatterParams(params)) return "#3b82f6";

              const dataIndex = params.dataIndex;
              return isValidDataIndex(dataIndex)
                ? (colors[dataIndex] ?? "#3b82f6")
                : "#3b82f6";
            },
          },
          emphasis: {
            itemStyle: {
              opacity: 0.8,
            },
          },
          label: showValues
            ? {
                show: true,
                position: isHorizontal ? ("right" as const) : ("top" as const),
                formatter: (params: unknown) => {
                  if (!isValidFormatterParams(params)) return valueFormatter(0);

                  const value =
                    typeof params.value === "number" ? params.value : 0;
                  return valueFormatter(value);
                },
              }
            : undefined,
        },
      ],
    };

    if (isHorizontal) {
      return {
        ...baseOption,
        xAxis: {
          type: "value",
          name: yLabel,
          nameLocation: "middle",
          nameGap: 35,
        },
        yAxis: {
          type: "category",
          data: labels,
          name: xLabel,
          nameLocation: "middle",
          nameGap: 80,
          inverse: true,
          axisLabel: {
            formatter: (value: string) => value,
          },
        },
      };
    } else {
      return {
        ...baseOption,
        xAxis: {
          type: "category",
          data: labels,
          name: xLabel,
          nameLocation: "middle",
          nameGap: 35,
          axisLabel: {
            rotate: labels.some((l) => l.length > 10) ? 45 : 0,
            formatter: (value: string) => value,
          },
        },
        yAxis: {
          type: "value",
          name: yLabel,
          nameLocation: "middle",
          nameGap: 50,
        },
      };
    }
  }, [
    processedData,
    orientation,
    xLabel,
    yLabel,
    title,
    showValues,
    valueFormatter,
    labelFormatter,
    maxLabelLength,
  ]);

  const events = useMemo(() => {
    const baseEvents = { ...baseProps.onEvents };

    if (onBarClick) {
      baseEvents.click = (params: unknown) => {
        if (!isValidEventParams(params)) return;

        if (
          params.componentType === "series" &&
          params.seriesType === "bar" &&
          isValidDataIndex(params.dataIndex)
        ) {
          const item = processedData[params.dataIndex];
          if (item) {
            onBarClick(item, params.dataIndex);
          }
        }
      };
    }

    return baseEvents;
  }, [baseProps.onEvents, onBarClick, processedData]);

  return <BaseChart {...baseProps} config={chartOption} onEvents={events} />;
}
