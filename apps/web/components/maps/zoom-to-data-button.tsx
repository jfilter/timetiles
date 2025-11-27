/**
 * Zoom to data button for map controls.
 *
 * A button that appears when data bounds differ from current viewport,
 * allowing users to quickly fit the map to their data.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { Maximize2 } from "lucide-react";

interface ZoomToDataButtonProps {
  onClick: () => void;
  visible: boolean;
}

export const ZoomToDataButton = ({ onClick, visible }: ZoomToDataButtonProps) => {
  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}
      aria-hidden={!visible}
    >
      <button
        type="button"
        onClick={onClick}
        title="Zoom to fit all events"
        aria-label="Zoom to fit all events"
        className={cn(
          "flex items-center gap-2 rounded bg-white px-3 py-1.5",
          "text-sm font-medium text-gray-700 shadow-md",
          "transition-colors hover:bg-gray-100",
          "dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        )}
      >
        <Maximize2 className="h-4 w-4" />
        <span>Zoom to data</span>
      </button>
    </div>
  );
};
