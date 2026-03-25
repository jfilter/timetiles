/**
 * Shared empty state component for content areas with no data.
 *
 * Provides a centered message with optional icon and description,
 * suitable for tables, lists, and other content containers.
 *
 * @module
 * @category Components
 */
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import * as React from "react";

import { cn } from "../lib/utils";

export interface EmptyStateProps {
  /** Primary message text */
  title?: string;
  /** Optional secondary description */
  description?: string;
  /** Override the default icon */
  icon?: ReactNode;
  /** Container height (number treated as px, string used as-is) */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Empty state component for content areas with no data.
 *
 * @example
 * ```tsx
 * <EmptyState />
 * <EmptyState title="No events found" description="Try adjusting your filters" />
 * <EmptyState icon={<MapPin className="h-12 w-12" />} title="No locations" />
 * ```
 */
export const EmptyState = ({ title = "No data yet", description, icon, height, className }: EmptyStateProps) => {
  const containerStyle = (() => {
    if (height == null) return undefined;
    const containerHeight = typeof height === "number" ? `${height}px` : height;
    return { height: containerHeight };
  })();

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} style={containerStyle}>
      <div className="text-muted-foreground/50">{icon ?? <Inbox className="h-12 w-12" />}</div>
      <div className="text-center">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </div>
    </div>
  );
};
