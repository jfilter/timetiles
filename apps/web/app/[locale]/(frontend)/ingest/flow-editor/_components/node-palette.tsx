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
import { ArrowLeftRight, Calendar, CaseSensitive, Scissors, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { type DragEvent, memo, useCallback } from "react";

import type { TransformType } from "@/lib/types/ingest-transforms";

interface NodePaletteProps {
  className?: string;
}

const PALETTE_ITEMS = [
  {
    type: "rename" as TransformType,
    icon: Type,
    color: "text-cartographic-blue",
    labelKey: "flowTransformRename",
    descriptionKey: "flowTransformRenameDescription",
  },
  {
    type: "date-parse" as TransformType,
    icon: Calendar,
    color: "text-cartographic-terracotta",
    labelKey: "flowTransformDateParse",
    descriptionKey: "flowTransformDateParseDescription",
  },
  {
    type: "string-op" as TransformType,
    icon: CaseSensitive,
    color: "text-cartographic-forest",
    labelKey: "flowTransformStringOp",
    descriptionKey: "flowTransformStringOpDescription",
  },
  {
    type: "concatenate" as TransformType,
    icon: ArrowLeftRight,
    color: "text-cartographic-navy",
    labelKey: "flowTransformConcatenate",
    descriptionKey: "flowTransformConcatenateDescription",
  },
  {
    type: "split" as TransformType,
    icon: Scissors,
    color: "text-purple-600",
    labelKey: "flowTransformSplit",
    descriptionKey: "flowTransformSplitDescription",
  },
] as const;

interface PaletteItemProps {
  item: (typeof PALETTE_ITEMS)[number];
}

const PaletteItem = memo(({ item }: Readonly<PaletteItemProps>) => {
  const t = useTranslations("Ingest");
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
      role="listitem"
      tabIndex={0}
      data-testid={`palette-item-${item.type}`}
      onDragStart={handleDragStart}
      className={cn(
        "bg-muted/50 hover:bg-muted flex cursor-grab items-start gap-3 rounded-md border p-3 transition-colors",
        "active:cursor-grabbing active:opacity-80"
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.color)} />
      <div className="min-w-0">
        <div className="text-foreground text-sm font-medium">{t(item.labelKey)}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">{t(item.descriptionKey)}</div>
      </div>
    </div>
  );
});
PaletteItem.displayName = "PaletteItem";

export const NodePalette = ({ className }: Readonly<NodePaletteProps>) => {
  const t = useTranslations("Ingest");

  return (
    <div className={cn("bg-background border-border flex flex-col gap-2 border-l p-3", className)}>
      <h3 className="text-muted-foreground mb-2 font-mono text-[10px] tracking-wide uppercase">
        {t("flowTransforms")}
      </h3>
      <p className="text-muted-foreground mb-3 text-xs">{t("flowTransformsDragHint")}</p>

      <div role="list" aria-label={t("flowAvailableTransforms")}>
        {PALETTE_ITEMS.map((item) => (
          <PaletteItem key={item.type} item={item} />
        ))}
      </div>
    </div>
  );
};
