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

import { ContentState, type ContentStateProps } from "../content-state";

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

const chartMessages: Record<ChartEmptyStateProps["variant"], { title: string; subtitle: string }> = {
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

const variantMap: Record<ChartEmptyStateProps["variant"], ContentStateProps["variant"]> = {
  "no-data": "empty",
  "no-match": "no-match",
  error: "error",
};

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
  return (
    <ContentState
      variant={variantMap[variant]}
      height={height}
      className={className}
      icon={variant === "no-data" ? <EmptyChartIcon /> : undefined}
      title={message ?? chartMessages[variant].title}
      subtitle={suggestion ?? chartMessages[variant].subtitle}
      onRetry={onRetry}
    />
  );
};
