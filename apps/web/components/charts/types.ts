/**
 * Shared types for chart components.
 *
 * Common interfaces and types used across histogram and bar chart components
 * to maintain consistency and reduce duplication.
 *
 * @module
 * @category Components
 */
import type { SimpleBounds } from "@/lib/utils/event-params";

/**
 * Common props for all chart components.
 *
 * All chart components accept these base props for consistent sizing
 * and bounds filtering.
 */
export interface BaseChartProps {
  /** Chart height in pixels or CSS string (e.g., "300px", "50vh") */
  height?: number | string;
  /** Additional CSS classes to apply */
  className?: string;
  /** Map bounds for filtering data (optional) */
  bounds?: SimpleBounds | null;
  /** Show DataZoom slider for interactive time range zooming */
  showDataZoom?: boolean;
}
