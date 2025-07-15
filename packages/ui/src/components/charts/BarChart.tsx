"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./BaseChart";
import type { BarChartProps } from "./types";

export function BarChart({
  data,
  orientation = "vertical",
  onBarClick,
  xLabel = "",
  yLabel = "",
  title = "",
  showValues = false,
  valueFormatter = (v) => v.toString(),
  labelFormatter = (l) => l,
  maxLabelLength = 20,
  sortBy = "none",
  sortOrder = "desc",
  ...baseProps
}: BarChartProps) {
  const processedData = useMemo(() => {
    const sorted = [...data];

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
    const colors = processedData.map((item) => item.color || "#3b82f6");

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
          const paramsArray = params as { dataIndex: number }[];
          const item = processedData[paramsArray[0]?.dataIndex];
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
          type: "bar",
          data: values,
          itemStyle: {
            color: (params: { dataIndex: number }) =>
              colors[params.dataIndex] || "#3b82f6",
          },
          emphasis: {
            itemStyle: {
              opacity: 0.8,
            },
          },
          label: showValues
            ? {
                show: true,
                position: isHorizontal ? "right" : "top",
                formatter: (params: { value: number }) =>
                  valueFormatter(params.value),
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
      baseEvents.click = (params: {
        componentType: string;
        seriesType: string;
        dataIndex: number;
      }) => {
        if (params.componentType === "series" && params.seriesType === "bar") {
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
