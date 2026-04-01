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
import { Collapsible, CollapsibleContent } from "@timetiles/ui/components/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { ChevronDown, Expand } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

export type ChartType = "histogram" | "dataset-bar" | "beeswarm";

export interface ChartMeta {
  label: string;
  heading: string;
  subtitle: string;
}

/** Get labels for each chart type in the dropdown using translations */
const useChartTypeLabels = (): Record<ChartType, string> => {
  const t = useTranslations("Explore");
  return { histogram: t("timeline"), beeswarm: t("beeswarm"), "dataset-bar": t("byDataset") };
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
  /** Whether the chart content is collapsed */
  isCollapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
}

const ALL_CHART_TYPES = ["histogram", "beeswarm", "dataset-bar"] as const satisfies readonly ChartType[];

export const VisualizationPanel = ({
  children,
  chartType,
  onChartTypeChange,
  chartMeta,
  availableChartTypes = ALL_CHART_TYPES,
  fillHeight = false,
  onExpandClick,
  isCollapsed = false,
  onToggleCollapse,
}: Readonly<VisualizationPanelProps>) => {
  const t = useTranslations("Explore");
  const chartTypeLabels = useChartTypeLabels();
  const handleValueChange = (value: string) => onChartTypeChange(value as ChartType);

  const showDropdown = availableChartTypes.length > 1;

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={() => onToggleCollapse?.()}
      className={fillHeight ? "flex h-full flex-col" : undefined}
    >
      <Card
        variant="default"
        padding="none"
        className={`overflow-hidden transition-shadow hover:shadow-sm ${fillHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}
      >
        <CardHeader className="flex flex-row items-center gap-2 px-4 py-2 md:px-6 md:py-3">
          {/* Collapse toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="text-muted-foreground hover:text-foreground -ml-1 flex shrink-0 items-center transition-colors"
              aria-label={isCollapsed ? t("expandChart") : t("collapseChart")}
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} />
            </button>
          )}

          {/* Chart type selector or plain label */}
          {showDropdown ? (
            <Select value={chartType} onValueChange={handleValueChange}>
              <SelectTrigger
                aria-label="Chart type"
                className="border-border/40 w-auto min-w-[130px] bg-transparent text-sm font-medium shadow-none"
                size="sm"
              >
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
          ) : (
            <span className="text-foreground text-sm font-medium">{chartMeta.heading}</span>
          )}

          <div className="flex-1" />

          {/* Fullscreen button */}
          {onExpandClick && !isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onExpandClick}
              aria-label={t("expandChart")}
              title={t("expandChart")}
              className="h-7 w-7"
            >
              <Expand className="h-3.5 w-3.5" />
            </Button>
          )}
        </CardHeader>

        <CollapsibleContent className={fillHeight ? "flex min-h-0 flex-1 flex-col" : undefined}>
          <CardContent className={`px-4 pt-4 pb-4 md:px-6 md:pb-6 ${fillHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
