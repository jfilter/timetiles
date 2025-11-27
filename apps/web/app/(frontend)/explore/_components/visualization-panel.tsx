/**
 * Container panel for the visualization section with premium styling.
 *
 * Provides card-based layout, header with chart type selector, and proper
 * section boundaries for the explore page. Uses cartographic design system
 * typography and styling.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, CardHeader } from "@timetiles/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { useCallback } from "react";

export type ChartType = "histogram" | "dataset-bar" | "catalog-bar";

export interface ChartMeta {
  label: string;
  heading: string;
  subtitle: string;
}

/** Labels for each chart type in the dropdown */
const CHART_TYPE_LABELS: Record<ChartType, string> = {
  histogram: "Timeline",
  "dataset-bar": "By Dataset",
  "catalog-bar": "By Catalog",
};

interface VisualizationPanelProps {
  children: React.ReactNode;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  chartMeta: ChartMeta;
  /** Which chart types are available based on current filters */
  availableChartTypes?: ChartType[];
  /** When true, the panel will fill available height */
  fillHeight?: boolean;
}

/**
 * Card-based container for chart visualization with cartographic styling.
 *
 * @example
 * ```tsx
 * <VisualizationPanel
 *   chartType="histogram"
 *   onChartTypeChange={setChartType}
 *   chartMeta={{ label: "Temporal Analysis", heading: "Event Timeline", subtitle: "Distribution over time" }}
 * >
 *   <EventHistogram />
 * </VisualizationPanel>
 * ```
 */
const ALL_CHART_TYPES: ChartType[] = ["histogram", "dataset-bar", "catalog-bar"];

export const VisualizationPanel = ({
  children,
  chartType,
  onChartTypeChange,
  chartMeta,
  availableChartTypes = ALL_CHART_TYPES,
  fillHeight = false,
}: Readonly<VisualizationPanelProps>) => {
  const handleValueChange = useCallback((value: string) => onChartTypeChange(value as ChartType), [onChartTypeChange]);

  // Only show dropdown if there are multiple options
  const showDropdown = availableChartTypes.length > 1;

  return (
    <Card
      variant="default"
      padding="none"
      className={`overflow-hidden transition-shadow hover:shadow-sm ${fillHeight ? "flex h-full flex-col" : ""}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b px-4 py-3 md:px-6 md:py-4">
        <div className="min-w-0 flex-1">
          {/* Section Label - cartographic monospace style */}
          <div className="text-cartographic-navy/60 mb-1 font-mono text-xs uppercase tracking-wider">
            {chartMeta.label}
          </div>
          {/* Heading - serif per design system */}
          <h2 className="text-foreground font-serif text-xl font-bold">{chartMeta.heading}</h2>
          {/* Subtitle - editorial polish */}
          <p className="text-muted-foreground mt-1 text-sm">{chartMeta.subtitle}</p>
        </div>

        {/* Chart Type Selector - only show if multiple options available */}
        {showDropdown && (
          <Select value={chartType} onValueChange={handleValueChange}>
            <SelectTrigger className="border-cartographic-navy/20 bg-background w-auto min-w-[140px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableChartTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {CHART_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>

      <CardContent className={`px-4 pb-4 pt-4 md:px-6 md:pb-6 ${fillHeight ? "flex flex-1 flex-col" : ""}`}>
        {children}
      </CardContent>
    </Card>
  );
};
