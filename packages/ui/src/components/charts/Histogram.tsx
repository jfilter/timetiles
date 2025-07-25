"use client";

import type { EChartsOption } from "echarts";
import { useMemo } from "react";

import { BaseChart } from "./BaseChart";
import type { HistogramProps, BinningStrategy } from "./types";
import { isValidFormatterParams, isValidEventParams, isValidDataIndex } from "./types";
import { createHistogramBins, formatDateForBin, determineBinningStrategy } from "./utils/data-transform";

export function Histogram<T = unknown>({
  data,
  xAccessor,
  yAccessor,
  binning = "auto",
  color = "#3b82f6",
  onBarClick,
  xLabel = "",
  yLabel = "Count",
  title = "",
  formatter = {},
  ...baseProps
}: HistogramProps<T>) {
  const bins = useMemo(() => {
    return createHistogramBins(data, xAccessor, binning);
  }, [data, xAccessor, binning]);

  const chartOption: EChartsOption = useMemo(() => {
    const xAxisData = bins.map((bin) => {
      const [start] = bin.range;
      const strategy =
        typeof binning === "string" && binning !== "auto"
          ? binning
          : determineBinningStrategy(
              new Date(
                Math.min(
                  ...data.map((d) => {
                    const val = xAccessor(d);
                    return val instanceof Date ? val.getTime() : new Date(val).getTime();
                  }),
                ),
              ),
              new Date(
                Math.max(
                  ...data.map((d) => {
                    const val = xAccessor(d);
                    return val instanceof Date ? val.getTime() : new Date(val).getTime();
                  }),
                ),
              ),
              binning,
            );

      return formatter.xAxis
        ? formatter.xAxis(start)
        : formatDateForBin(start instanceof Date ? start : new Date(start), strategy as BinningStrategy);
    });

    const yAxisData = bins.map((bin) => (yAccessor ? yAccessor(bin.items) : bin.count));

    return {
      title: title
        ? {
            text: title,
            left: "center",
            top: 0,
          }
        : undefined,
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return "";

          const firstParam = params[0] as unknown;
          if (!isValidFormatterParams(firstParam)) return "";

          const dataIndex = firstParam.dataIndex;
          if (!isValidDataIndex(dataIndex)) return "";

          const bin = bins[dataIndex];
          if (!bin) return "";

          if (formatter.tooltip) {
            return formatter.tooltip(bin);
          }

          const [start, end] = bin.range;
          const startDate = start instanceof Date ? start : new Date(start);
          const endDate = end instanceof Date ? end : new Date(end);
          const dateStr = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;

          return `${dateStr}<br/>Count: ${bin.count}`;
        },
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        name: xLabel,
        nameLocation: "middle",
        nameGap: 35,
        axisLabel: {
          rotate: bins.length > 10 ? 45 : 0,
          formatter: formatter.xAxis,
        },
      },
      yAxis: {
        type: "value",
        name: yLabel,
        nameLocation: "middle",
        nameGap: 50,
        axisLabel: {
          formatter: formatter.yAxis,
        },
      },
      series: [
        {
          type: "bar",
          data: yAxisData,
          itemStyle: {
            color:
              typeof color === "function"
                ? (params: unknown) => {
                    if (!isValidFormatterParams(params)) return "#ccc";

                    const dataIndex = params.dataIndex;
                    if (isValidDataIndex(dataIndex)) {
                      const bin = bins[dataIndex];
                      return bin ? color(bin) : "#ccc";
                    }
                    return "#ccc";
                  }
                : color,
          },
          emphasis: {
            itemStyle: {
              opacity: 0.8,
            },
          },
        },
      ],
      grid: {
        left: "10%",
        right: "5%",
        bottom: bins.length > 10 ? "15%" : "10%",
        top: title ? "15%" : "10%",
        containLabel: true,
      },
    };
  }, [bins, data, xAccessor, yAccessor, binning, color, xLabel, yLabel, title, formatter]);

  const events = useMemo(() => {
    const baseEvents = { ...baseProps.onEvents };

    if (onBarClick) {
      baseEvents.click = (params: unknown) => {
        if (!isValidEventParams(params)) return;

        if (params.componentType === "series" && params.seriesType === "bar" && isValidDataIndex(params.dataIndex)) {
          const bin = bins[params.dataIndex];
          if (bin) {
            onBarClick(bin);
          }
        }
      };
    }

    return baseEvents;
  }, [baseProps.onEvents, onBarClick, bins]);

  return <BaseChart {...baseProps} config={chartOption} onEvents={events} />;
}
