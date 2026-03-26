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

import { Button } from "@timetiles/ui/components/button";
import { Card, CardContent, CardHeader } from "@timetiles/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

type IconComponent = React.ComponentType<{ className?: string }>;

export type ChartType = "histogram" | "dataset-bar" | "catalog-bar" | "beeswarm";

export interface ChartMeta {
  label: string;
  heading: string;
  subtitle: string;
}

/** Get labels for each chart type in the dropdown using translations */
const useChartTypeLabels = (): Record<ChartType, string> => {
  const t = useTranslations("Explore");
  return {
    histogram: t("timeline"),
    beeswarm: t("beeswarm"),
    "dataset-bar": t("byDataset"),
    "catalog-bar": t("byCatalog"),
  };
};

interface VisualizationPanelProps {
  children: React.ReactNode;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  chartMeta: ChartMeta;
  /** Which chart types are available based on current filters */
  availableChartTypes?: readonly ChartType[];
  /** When true, the panel will fill available height */
  fillHeight?: boolean;
  /** Callback when the expand/fullscreen button is clicked */
  onExpandClick?: () => void;
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
const ALL_CHART_TYPES = ["histogram", "beeswarm", "dataset-bar", "catalog-bar"] as const satisfies readonly ChartType[];

export const VisualizationPanel = ({
  children,
  chartType,
  onChartTypeChange,
  chartMeta,
  availableChartTypes = ALL_CHART_TYPES,
  fillHeight = false,
  onExpandClick,
}: Readonly<VisualizationPanelProps>) => {
  const t = useTranslations("Explore");
  const chartTypeLabels = useChartTypeLabels();
  const handleValueChange = (value: string) => onChartTypeChange(value as ChartType);

  // Only show dropdown if there are multiple options
  const showDropdown = availableChartTypes.length > 1;

  return (
    <Card
      variant="default"
      padding="none"
      className={`overflow-hidden transition-shadow hover:shadow-sm ${fillHeight ? "flex h-full flex-col" : ""}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b px-4 py-2 md:px-6 md:py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground font-serif text-base font-bold">{chartMeta.heading}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Chart Type Selector - only show if multiple options available */}
          {showDropdown && (
            <Select value={chartType} onValueChange={handleValueChange}>
              <SelectTrigger aria-label="Chart type" className="border-primary/20 bg-background w-auto min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableChartTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {chartTypeLabels[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {onExpandClick && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onExpandClick}
              aria-label={t("expandChart")}
              title={t("expandChart")}
              className="h-8 w-8"
            >
              {React.createElement(Maximize2 as IconComponent, { className: "h-4 w-4" })}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className={`px-4 pt-4 pb-4 md:px-6 md:pb-6 ${fillHeight ? "flex flex-1 flex-col" : ""}`}>
        {children}
      </CardContent>
    </Card>
  );
};
