/**
 * Chart visualization section with multiple chart types.
 *
 * Container component that allows switching between different chart
 * visualizations including time-based histograms and dataset bar charts.
 * Manages chart type selection and passes data to appropriate chart components.
 *
 * @module
 * @category Components
 */
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useCallback, useState } from "react";

import type { SimpleBounds } from "../lib/hooks/use-events-queries";
import type { Catalog, Dataset, Event } from "../payload-types";
import { DatasetBarChart } from "./dataset-bar-chart";
import { EventHistogram } from "./event-histogram";

interface ChartSectionProps {
  events: Event[];
  datasets: Dataset[];
  catalogs: Catalog[];
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  bounds?: SimpleBounds | null;
}

type ChartType = "timeline" | "dataset-bar" | "catalog-bar";

export const ChartSection = ({
  events,
  datasets,
  catalogs,
  isInitialLoad = false,
  isUpdating = false,
  bounds,
}: Readonly<ChartSectionProps>) => {
  const [chartType, setChartType] = useState<ChartType>("timeline");

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
            <SelectItem value="timeline">Event Timeline</SelectItem>
            <SelectItem value="dataset-bar">Events by Dataset</SelectItem>
            <SelectItem value="catalog-bar">Events by Catalog</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-[200px]">
        {chartType === "timeline" && (
          <EventHistogram isInitialLoad={isInitialLoad} isUpdating={isUpdating} bounds={bounds} />
        )}
        {chartType === "dataset-bar" && (
          <DatasetBarChart
            events={events}
            datasets={datasets}
            catalogs={catalogs}
            groupBy="dataset"
            isInitialLoad={isInitialLoad}
            isUpdating={isUpdating}
          />
        )}
        {chartType === "catalog-bar" && (
          <DatasetBarChart
            events={events}
            datasets={datasets}
            catalogs={catalogs}
            groupBy="catalog"
            isInitialLoad={isInitialLoad}
            isUpdating={isUpdating}
          />
        )}
      </div>
    </div>
  );
};
