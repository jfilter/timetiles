/**
 * Sheet tab button for multi-sheet file navigation.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { CheckCircleIcon } from "lucide-react";

export interface SheetTabButtonProps {
  sheetIndex: number;
  displayName: string;
  rowCount: number;
  isComplete: boolean;
  isActive: boolean;
  onSelect: (index: number) => void;
}

export const SheetTabButton = ({
  sheetIndex,
  displayName,
  rowCount,
  isComplete,
  isActive,
  onSelect,
}: Readonly<SheetTabButtonProps>) => {
  const handleClick = () => {
    onSelect(sheetIndex);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid={`sheet-tab-${sheetIndex}`}
      className={cn(
        "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors",
        isActive
          ? "border-cartographic-blue bg-cartographic-blue/10 text-cartographic-blue"
          : "border-cartographic-navy/20 hover:border-cartographic-navy/40 text-cartographic-charcoal",
        isComplete && !isActive && "border-cartographic-forest/40 bg-cartographic-forest/5"
      )}
    >
      {isComplete && <CheckCircleIcon className="text-cartographic-forest h-4 w-4" />}
      <span>{displayName}</span>
      <span className="text-muted-foreground font-mono text-xs">({rowCount})</span>
    </button>
  );
};
