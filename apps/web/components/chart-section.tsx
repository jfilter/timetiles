"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useState } from "react";

import { DatasetBarChart } from "./dataset-bar-chart";
import { EventHistogram } from "./event-histogram";
import type { Event, Dataset, Catalog } from "../payload-types";

interface ChartSectionProps {
  events: Event[];
  datasets: Dataset[];
  catalogs: Catalog[];
  loading?: boolean;
}

type ChartType = "timeline" | "dataset-bar" | "catalog-bar";

export function ChartSection({
  events,
  datasets,
  catalogs,
  loading,
}: ChartSectionProps) {
  const [chartType, setChartType] = useState<ChartType>("timeline");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Data Visualization</h2>
        <Select
          value={chartType}
          onValueChange={(value) => setChartType(value as ChartType)}
        >
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
        {chartType === "timeline" && <EventHistogram loading={loading} />}
        {chartType === "dataset-bar" && (
          <DatasetBarChart
            events={events}
            datasets={datasets}
            catalogs={catalogs}
            groupBy="dataset"
            loading={loading}
          />
        )}
        {chartType === "catalog-bar" && (
          <DatasetBarChart
            events={events}
            datasets={datasets}
            catalogs={catalogs}
            groupBy="catalog"
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
