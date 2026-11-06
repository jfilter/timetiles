/**
 * Sliding desktop filter panel wrapper.
 *
 * Shared between map-explorer and list-explorer for the collapsible
 * filter drawer sidebar.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import type { ReactNode } from "react";

interface FilterPanelProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
}

export const FilterPanel = ({ isOpen, children, className }: FilterPanelProps) => (
  // `inert` rather than unmounting: the children stay in the DOM so the width
  // transition still runs, but a closed drawer leaves the tab order and the
  // accessibility tree.
  <div
    inert={!isOpen}
    className={cn(
      "shrink-0 border-l transition-[width] duration-500 ease-in-out",
      isOpen ? "w-80" : "w-0 overflow-hidden",
      className
    )}
  >
    {children}
  </div>
);
