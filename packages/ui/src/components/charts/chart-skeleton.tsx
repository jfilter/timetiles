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

import { cn } from "../../lib/utils";

export interface ChartSkeletonProps {
  /** Type of skeleton to display */
  variant: "histogram" | "bar" | "scatter";
  /** Height of the skeleton container */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
}

// Pre-defined heights for histogram skeleton bars (percentage of container height)
const HISTOGRAM_BAR_HEIGHTS = [35, 60, 85, 50, 70, 40, 90, 55, 75, 45, 65, 80];
const BAR_CHART_WIDTHS = [75, 90, 60, 85, 70];

// Scatter dot positions (x%, y%, size in px, animation delay)
const SCATTER_DOTS: Array<{ x: number; y: number; size: number; delay: number }> = [
  { x: 8, y: 50, size: 10, delay: 0 },
  { x: 14, y: 42, size: 8, delay: 30 },
  { x: 16, y: 58, size: 8, delay: 60 },
  { x: 25, y: 38, size: 12, delay: 90 },
  { x: 28, y: 52, size: 10, delay: 120 },
  { x: 30, y: 45, size: 8, delay: 150 },
  { x: 32, y: 60, size: 10, delay: 180 },
  { x: 35, y: 35, size: 8, delay: 210 },
  { x: 44, y: 48, size: 14, delay: 240 },
  { x: 47, y: 38, size: 10, delay: 270 },
  { x: 49, y: 55, size: 12, delay: 300 },
  { x: 52, y: 42, size: 8, delay: 330 },
  { x: 54, y: 62, size: 10, delay: 360 },
  { x: 56, y: 50, size: 8, delay: 390 },
  { x: 65, y: 46, size: 10, delay: 420 },
  { x: 68, y: 54, size: 8, delay: 450 },
  { x: 78, y: 40, size: 12, delay: 480 },
  { x: 80, y: 52, size: 10, delay: 510 },
  { x: 82, y: 58, size: 8, delay: 540 },
  { x: 90, y: 48, size: 10, delay: 570 },
];

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
  const containerHeight = typeof height === "number" ? `${height}px` : height;
  const containerStyle = { height: containerHeight };

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

  if (variant === "scatter") {
    return (
      <div className={cn("relative flex flex-col", className)} style={containerStyle}>
        <div className="relative flex-1">
          {SCATTER_DOTS.map((dot) => (
            <div
              key={`dot-${dot.x}-${dot.y}`}
              className="bg-muted absolute animate-pulse rounded-full"
              style={{
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: dot.size,
                height: dot.size,
                animationDelay: `${dot.delay}ms`,
              }}
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
