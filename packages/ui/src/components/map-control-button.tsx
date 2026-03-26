/**
 * Compact icon button for map controls.
 *
 * Standard 29x29px button with white background and shadow, matching
 * the MapLibre NavigationControl style. Used for theme toggle, cluster
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
        "flex h-[29px] w-[29px] items-center justify-center rounded bg-white shadow-md transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);

MapControlButton.displayName = "MapControlButton";
