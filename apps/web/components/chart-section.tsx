/**
 * Chart visualization section with multiple chart types.
 *
 * Container component that allows switching between different chart
 * visualizations including time-based histograms and dataset bar charts.
 * Manages chart type selection. Charts fetch their own data.
 *
 * @module
 * @category Components
 */
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useCallback, useState } from "react";

import type { SimpleBounds } from "../lib/hooks/use-events-queries";
import { AggregationBarChart } from "./aggregation-bar-chart";
import { EventHistogram } from "./event-histogram";
import { SimpleBarChart } from "./simple-bar-chart";

interface ChartSectionProps {
  bounds?: SimpleBounds | null;
}

type ChartType = "histogram" | "dataset-bar" | "catalog-bar" | "simple-bar";

export const ChartSection = ({ bounds }: Readonly<ChartSectionProps>) => {
  const [chartType, setChartType] = useState<ChartType>("histogram");

  const handleChartTypeChange = useCallback((value: string) => setChartType(value as ChartType), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Data Visualization</h2>
        <Select value={chartType} onValueChange={handleChartTypeChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="histogram">Event histogram</SelectItem>
            <SelectItem value="dataset-bar">Events by Dataset</SelectItem>
            <SelectItem value="catalog-bar">Events by Catalog</SelectItem>
            <SelectItem value="simple-bar">Simple Bar Chart</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-[200px]">
        {chartType === "histogram" && <EventHistogram bounds={bounds} />}
        {chartType === "dataset-bar" && <AggregationBarChart bounds={bounds} type="dataset" />}
        {chartType === "catalog-bar" && <AggregationBarChart bounds={bounds} type="catalog" />}
        {chartType === "simple-bar" && <SimpleBarChart bounds={bounds} type="catalog" />}
      </div>
    </div>
  );
};
