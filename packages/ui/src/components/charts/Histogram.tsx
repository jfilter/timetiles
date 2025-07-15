"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./BaseChart";
import type { HistogramProps } from "./types";
import { createHistogramBins, formatDateForBin, determineBinningStrategy } from "./utils/data-transform";

export function Histogram<T = any>({
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
    const xAxisData = bins.map(bin => {
      const [start] = bin.range;
      const strategy = typeof binning === "string" && binning !== "auto" 
        ? binning 
        : determineBinningStrategy(
            new Date(Math.min(...data.map(d => {
              const val = xAccessor(d);
              return val instanceof Date ? val.getTime() : new Date(val).getTime();
            }))),
            new Date(Math.max(...data.map(d => {
              const val = xAccessor(d);
              return val instanceof Date ? val.getTime() : new Date(val).getTime();
            }))),
            binning
          );
      
      return formatter.xAxis 
        ? formatter.xAxis(start)
        : formatDateForBin(start instanceof Date ? start : new Date(start), strategy as any);
    });

    const yAxisData = bins.map(bin => 
      yAccessor ? yAccessor(bin.items) : bin.count
    );

    return {
      title: title ? {
        text: title,
        left: "center",
        top: 0
      } : undefined,
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const bin = bins[params[0]?.dataIndex];
          if (!bin) return '';
          if (formatter.tooltip) {
            return formatter.tooltip(bin);
          }
          
          const [start, end] = bin.range;
          const startDate = start instanceof Date ? start : new Date(start);
          const endDate = end instanceof Date ? end : new Date(end);
          const dateStr = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
          
          return `${dateStr}<br/>Count: ${bin.count}`;
        }
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        name: xLabel,
        nameLocation: "middle",
        nameGap: 35,
        axisLabel: {
          rotate: bins.length > 10 ? 45 : 0,
          formatter: formatter.xAxis
        }
      },
      yAxis: {
        type: "value",
        name: yLabel,
        nameLocation: "middle",
        nameGap: 50,
        axisLabel: {
          formatter: formatter.yAxis
        }
      },
      series: [{
        type: "bar",
        data: yAxisData,
        itemStyle: {
          color: typeof color === "function" 
            ? (params: any) => {
                const bin = bins[params.dataIndex];
                return bin ? color(bin) : '#ccc';
              }
            : color
        },
        emphasis: {
          itemStyle: {
            opacity: 0.8
          }
        }
      }],
      grid: {
        left: "10%",
        right: "5%",
        bottom: bins.length > 10 ? "15%" : "10%",
        top: title ? "15%" : "10%",
        containLabel: true
      }
    };
  }, [bins, data, xAccessor, yAccessor, binning, color, xLabel, yLabel, title, formatter]);

  const events = useMemo(() => {
    const baseEvents = { ...baseProps.onEvents };
    
    if (onBarClick) {
      baseEvents.click = (params: any) => {
        if (params.componentType === "series" && params.seriesType === "bar") {
          const bin = bins[params.dataIndex];
          if (bin) {
            onBarClick(bin);
          }
        }
      };
    }
    
    return baseEvents;
  }, [baseProps.onEvents, onBarClick, bins]);

  return (
    <BaseChart
      {...baseProps}
      config={chartOption}
      onEvents={events}
    />
  );
}