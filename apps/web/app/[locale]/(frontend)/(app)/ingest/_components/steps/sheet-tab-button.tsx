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
        isActive ? "border-ring bg-ring/10 text-ring" : "border-primary/20 hover:border-primary/40 text-foreground",
        isComplete && !isActive && "border-accent/40 bg-accent/5"
      )}
    >
      {isComplete && <CheckCircleIcon className="text-accent h-4 w-4" />}
      <span>{displayName}</span>
      <span className="text-muted-foreground font-mono text-xs">({rowCount})</span>
    </button>
  );
};
