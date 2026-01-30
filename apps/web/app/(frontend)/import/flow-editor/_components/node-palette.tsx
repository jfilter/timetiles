/**
 * Node palette for dragging transform nodes onto the canvas.
 *
 * Displays available transform types that can be added to the flow
 * by dragging and dropping.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeftRight, Calendar, CaseSensitive, type LucideIcon, Scissors, Type } from "lucide-react";
import { type DragEvent, memo, useCallback } from "react";

import { TRANSFORM_TYPE_DESCRIPTIONS, TRANSFORM_TYPE_LABELS, type TransformType } from "@/lib/types/import-transforms";

interface NodePaletteProps {
  className?: string;
}

interface TransformPaletteItem {
  type: TransformType;
  icon: LucideIcon;
  color: string;
}

const PALETTE_ITEMS: TransformPaletteItem[] = [
  { type: "rename", icon: Type, color: "text-cartographic-blue" },
  { type: "date-parse", icon: Calendar, color: "text-cartographic-terracotta" },
  { type: "string-op", icon: CaseSensitive, color: "text-cartographic-forest" },
  { type: "concatenate", icon: ArrowLeftRight, color: "text-cartographic-navy" },
  { type: "split", icon: Scissors, color: "text-purple-600" },
];

interface PaletteItemProps {
  item: TransformPaletteItem;
}

const PaletteItem = memo(({ item }: Readonly<PaletteItemProps>) => {
  const Icon = item.icon;

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData("application/reactflow", "transform");
      event.dataTransfer.setData("application/transform-type", item.type);
      event.dataTransfer.effectAllowed = "move";
    },
    [item.type]
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        "bg-muted/50 hover:bg-muted flex cursor-grab items-start gap-3 rounded-md border p-3 transition-colors",
        "active:cursor-grabbing active:opacity-80"
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.color)} />
      <div className="min-w-0">
        <div className="text-foreground text-sm font-medium">{TRANSFORM_TYPE_LABELS[item.type]}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">{TRANSFORM_TYPE_DESCRIPTIONS[item.type]}</div>
      </div>
    </div>
  );
});
PaletteItem.displayName = "PaletteItem";

export const NodePalette = ({ className }: Readonly<NodePaletteProps>) => {
  return (
    <div className={cn("bg-background border-border flex flex-col gap-2 border-l p-3", className)}>
      <h3 className="text-muted-foreground mb-2 font-mono text-[10px] tracking-wide uppercase">Transforms</h3>
      <p className="text-muted-foreground mb-3 text-xs">Drag a transform onto the canvas to add data processing</p>

      {PALETTE_ITEMS.map((item) => (
        <PaletteItem key={item.type} item={item} />
      ))}
    </div>
  );
};
