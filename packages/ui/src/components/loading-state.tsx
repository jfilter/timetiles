/**
 * Shared loading state component with multiple display variants.
 *
 * Provides consistent loading indicators across the application with support
 * for spinner, overlay, text, and skeleton variants.
 *
 * @module
 * @category Components
 */
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";

export interface LoadingStateProps {
  /** Display variant */
  variant?: "spinner" | "overlay" | "text" | "skeleton";
  /** Optional message displayed alongside the indicator */
  message?: string;
  /** Container height (number treated as px, string used as-is) */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Loading state component with multiple display variants.
 *
 * @example
 * ```tsx
 * <LoadingState />
 * <LoadingState variant="overlay" message="Loading map data..." />
 * <LoadingState variant="text" message="Please wait..." />
 * <LoadingState variant="skeleton" height={200} />
 * ```
 */
export const LoadingState = ({ variant = "spinner", message, height, className }: LoadingStateProps) => {
  const containerStyle = (() => {
    if (height == null) return undefined;
    const containerHeight = typeof height === "number" ? `${height}px` : height;
    return { height: containerHeight };
  })();

  if (variant === "overlay") {
    return (
      <div
        className={cn(
          "bg-background/60 pointer-events-auto absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm",
          className
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          {message && <span className="text-muted-foreground text-sm font-medium">{message}</span>}
        </div>
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={cn("flex items-center justify-center", className)} style={containerStyle}>
        <span className="text-muted-foreground text-sm">{message ?? "Loading..."}</span>
      </div>
    );
  }

  if (variant === "skeleton") {
    return (
      <div
        className={cn("bg-muted animate-pulse rounded", className)}
        style={containerStyle ?? { height: "200px" }}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  // Default: spinner variant
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} style={containerStyle}>
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
      {message && <span className="text-muted-foreground text-sm font-medium">{message}</span>}
    </div>
  );
};
