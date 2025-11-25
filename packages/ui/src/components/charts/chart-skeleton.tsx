/**
 * Skeleton loading state for chart components.
 *
 * Shows a placeholder structure that matches the chart's visual form
 * for better perceived performance during initial data loading.
 *
 * @module
 * @category Components
 */
"use client";

import { useMemo } from "react";

import { cn } from "../../lib/utils";

export interface ChartSkeletonProps {
  /** Type of skeleton to display */
  variant: "histogram" | "bar";
  /** Height of the skeleton container */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
}

// Pre-defined heights for histogram skeleton bars (percentage of container height)
const HISTOGRAM_BAR_HEIGHTS = [35, 60, 85, 50, 70, 40, 90, 55, 75, 45, 65, 80];
const BAR_CHART_WIDTHS = [75, 90, 60, 85, 70];

// Pre-computed styles for histogram bars (stable references)
const HISTOGRAM_BAR_STYLES = HISTOGRAM_BAR_HEIGHTS.map((barHeight, index) => ({
  height: `${barHeight}%`,
  flex: 1,
  animationDelay: `${index * 50}ms`,
}));

// Pre-computed styles for bar chart bars (stable references)
const BAR_CHART_STYLES = BAR_CHART_WIDTHS.map((width, index) => ({
  width: `${width}%`,
  animationDelay: `${index * 75}ms`,
}));

/**
 * Skeleton loading component for charts.
 *
 * @example
 * ```tsx
 * <ChartSkeleton variant="histogram" height={200} />
 * <ChartSkeleton variant="bar" height={300} />
 * ```
 */
export const ChartSkeleton = ({ variant, height = 200, className }: ChartSkeletonProps) => {
  const containerStyle = useMemo(() => {
    const containerHeight = typeof height === "number" ? `${height}px` : height;
    return { height: containerHeight };
  }, [height]);

  if (variant === "histogram") {
    return (
      <div className={cn("flex flex-col", className)} style={containerStyle}>
        {/* Chart area */}
        <div className="flex flex-1 items-end justify-between gap-1 px-8 pb-6">
          {HISTOGRAM_BAR_HEIGHTS.map((barHeight, index) => (
            <div
              key={`bar-${barHeight}`}
              className="bg-muted animate-pulse rounded-t-sm"
              style={HISTOGRAM_BAR_STYLES[index]}
            />
          ))}
        </div>
        {/* X-axis line */}
        <div className="bg-muted mx-8 h-px" />
        {/* X-axis labels skeleton */}
        <div className="flex justify-between px-8 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-muted h-2 w-12 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Bar chart variant (horizontal bars)
  return (
    <div className={cn("flex flex-col justify-center gap-3 py-4", className)} style={containerStyle}>
      {BAR_CHART_WIDTHS.map((width, index) => (
        <div key={`bar-${width}`} className="flex items-center gap-3 px-6">
          {/* Label skeleton */}
          <div className="bg-muted h-3 w-20 shrink-0 animate-pulse rounded" />
          {/* Bar skeleton */}
          <div className="bg-muted h-6 animate-pulse rounded-sm" style={BAR_CHART_STYLES[index]} />
        </div>
      ))}
    </div>
  );
};
