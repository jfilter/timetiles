/**
 * Empty state display for chart components.
 *
 * Shows contextual messaging when no data is available, with different
 * variants for no data, no filter matches, and error states.
 *
 * @module
 * @category Components
 */
"use client";

import { AlertTriangle, Filter } from "lucide-react";
import { useMemo } from "react";

import { cn } from "../../lib/utils";

export interface ChartEmptyStateProps {
  /** Type of empty state to display */
  variant: "no-data" | "no-match" | "error";
  /** Height of the container */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Custom message to display */
  message?: string;
  /** Suggestion text below the message */
  suggestion?: string;
  /** Callback for retry button (only shown for error variant) */
  onRetry?: () => void;
}

const defaultMessages: Record<ChartEmptyStateProps["variant"], { title: string; subtitle: string }> = {
  "no-data": {
    title: "No data yet",
    subtitle: "Import events to see visualizations",
  },
  "no-match": {
    title: "No matching events",
    subtitle: "Try adjusting your filters",
  },
  error: {
    title: "Unable to load chart",
    subtitle: "Something went wrong",
  },
};

/**
 * Custom SVG icon for empty chart state - dashed bar chart outline
 */
const EmptyChartIcon = () => (
  <svg
    className="h-12 w-12"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Stylized bar chart with dashed lines */}
    <rect x="8" y="28" width="6" height="12" strokeDasharray="3 2" />
    <rect x="18" y="20" width="6" height="20" strokeDasharray="3 2" />
    <rect x="28" y="14" width="6" height="26" strokeDasharray="3 2" />
    <rect x="38" y="22" width="6" height="18" strokeDasharray="3 2" />
    <line x1="4" y1="42" x2="48" y2="42" />
  </svg>
);

/**
 * Empty state component for charts.
 *
 * @example
 * ```tsx
 * <ChartEmptyState variant="no-match" height={200} />
 * <ChartEmptyState
 *   variant="error"
 *   height={200}
 *   onRetry={() => refetch()}
 * />
 * ```
 */
export const ChartEmptyState = ({
  variant,
  height = 200,
  className,
  message,
  suggestion,
  onRetry,
}: ChartEmptyStateProps) => {
  const containerStyle = useMemo(() => {
    const containerHeight = typeof height === "number" ? `${height}px` : height;
    return { height: containerHeight };
  }, [height]);
  const defaults = defaultMessages[variant];

  const renderIcon = () => {
    switch (variant) {
      case "no-data":
        return <EmptyChartIcon />;
      case "no-match":
        return <Filter className="h-12 w-12" />;
      case "error":
        return <AlertTriangle className="h-12 w-12" />;
    }
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} style={containerStyle}>
      <div className={cn("text-muted-foreground/50", variant === "error" && "text-destructive/50")}>{renderIcon()}</div>
      <div className="text-center">
        <p className="text-foreground text-sm font-medium">{message ?? defaults.title}</p>
        <p className="text-muted-foreground mt-1 text-xs">{suggestion ?? defaults.subtitle}</p>
      </div>
      {variant === "error" && onRetry != null && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 rounded-sm px-4 py-1.5 text-xs font-medium transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
};
