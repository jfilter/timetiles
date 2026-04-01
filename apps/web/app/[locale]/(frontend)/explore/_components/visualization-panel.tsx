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
import { Card, CardContent, CardToolbar, CardToolbarSpacer } from "@timetiles/ui/components/card";
import { Collapsible, CollapsibleContent } from "@timetiles/ui/components/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@timetiles/ui/components/select";
import { Expand } from "lucide-react";
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

const HIDE_VALUE = "__hide__";

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

  const handleValueChange = (value: string) => {
    if (value === HIDE_VALUE) {
      onToggleCollapse?.();
    } else {
      // If collapsed, expand when selecting a chart type
      if (isCollapsed) onToggleCollapse?.();
      onChartTypeChange(value as ChartType);
    }
  };

  const showDropdown = availableChartTypes.length > 1 || onToggleCollapse;

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
        <CardToolbar>
          {/* Chart type selector with optional hide/show */}
          {showDropdown ? (
            <Select value={isCollapsed ? HIDE_VALUE : chartType} onValueChange={handleValueChange}>
              <SelectTrigger aria-label="Chart type" className="w-auto shadow-none" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableChartTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {chartTypeLabels[type]}
                  </SelectItem>
                ))}
                {onToggleCollapse && (
                  <>
                    <SelectSeparator />
                    <SelectItem value={HIDE_VALUE}>{isCollapsed ? t("showChart") : t("hideChart")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-foreground text-sm font-medium">{chartMeta.heading}</span>
          )}

          <CardToolbarSpacer />

          {/* Analyze / fullscreen button */}
          {onExpandClick && !isCollapsed && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExpandClick}
              aria-label={t("analyzeChart")}
              className="shrink-0 text-xs"
            >
              {t("analyzeChart")}
              <Expand className="h-3 w-3" />
            </Button>
          )}
        </CardToolbar>

        <CollapsibleContent className={fillHeight ? "flex min-h-0 flex-1 flex-col" : undefined}>
          <CardContent className={`px-4 pt-4 pb-4 md:px-6 md:pb-6 ${fillHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
