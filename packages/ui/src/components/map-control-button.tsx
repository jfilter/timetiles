/**
 * Compact icon button for map controls.
 *
 * Standard 29x29px button with theme-aware surface tokens and shadow,
 * matching the MapLibre NavigationControl footprint. Used for theme toggle, cluster
 * density, and other map overlay controls.
 *
 * @module
 * @category Components
 */
import { forwardRef } from "react";

import { cn } from "../lib/utils";

export interface MapControlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const MapControlButton = forwardRef<HTMLButtonElement, MapControlButtonProps>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "border-border bg-background text-foreground ring-ring/40 flex h-[29px] w-[29px] items-center justify-center rounded-sm border shadow-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);

MapControlButton.displayName = "MapControlButton";
