/**
 * Transform node for the flow editor.
 *
 * Represents a data transformation operation that sits between source
 * columns and target fields. Displays the transform type, configuration,
 * and provides inline editing capabilities.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { Handle, Position } from "@xyflow/react";
import { ArrowLeftRight, Calendar, CaseSensitive, type LucideIcon, RefreshCw, Scissors, Type } from "lucide-react";
import { memo } from "react";

import type { TransformNodeData } from "@/lib/types/flow-mapping";
import { TRANSFORM_TYPE_LABELS, type TransformType } from "@/lib/types/import-transforms";

interface TransformNodeProps {
  data: TransformNodeData;
  selected?: boolean;
}

const TRANSFORM_ICONS: Record<TransformType, LucideIcon> = {
  rename: Type,
  "date-parse": Calendar,
  "string-op": CaseSensitive,
  concatenate: ArrowLeftRight,
  split: Scissors,
  "type-cast": RefreshCw,
};

const TRANSFORM_COLORS: Record<TransformType, { bg: string; border: string; text: string }> = {
  rename: {
    bg: "bg-cartographic-blue/5",
    border: "border-cartographic-blue/50",
    text: "text-cartographic-blue",
  },
  "date-parse": {
    bg: "bg-cartographic-terracotta/5",
    border: "border-cartographic-terracotta/50",
    text: "text-cartographic-terracotta",
  },
  "string-op": {
    bg: "bg-cartographic-forest/5",
    border: "border-cartographic-forest/50",
    text: "text-cartographic-forest",
  },
  concatenate: {
    bg: "bg-cartographic-navy/5",
    border: "border-cartographic-navy/50",
    text: "text-cartographic-navy",
  },
  split: {
    bg: "bg-purple-500/5",
    border: "border-purple-500/50",
    text: "text-purple-600",
  },
  "type-cast": {
    bg: "bg-amber-500/5",
    border: "border-amber-500/50",
    text: "text-amber-600",
  },
};

/**
 * Get a summary of the transform configuration for display
 */
const getTransformSummary = (data: TransformNodeData): string => {
  const { transform } = data;

  switch (transform.type) {
    case "rename":
      return `${transform.from} → ${transform.to}`;
    case "date-parse":
      return `${transform.inputFormat} → ${transform.outputFormat}`;
    case "string-op":
      return transform.operation;
    case "concatenate":
      return `${transform.fromFields.length} fields → ${transform.to}`;
    case "split":
      return `"${transform.delimiter}" → ${transform.toFields.length} fields`;
    case "type-cast":
      return `${transform.fromType} → ${transform.toType}`;
    default:
      return "";
  }
};

/**
 * Get the source field(s) for the transform
 */
const getSourceFields = (data: TransformNodeData): string[] => {
  const { transform } = data;

  switch (transform.type) {
    case "rename":
    case "date-parse":
    case "string-op":
    case "split":
    case "type-cast":
      return [transform.from];
    case "concatenate":
      return transform.fromFields;
    default:
      return [];
  }
};

const TransformNodeComponent = ({ data, selected }: Readonly<TransformNodeProps>) => {
  const { transform, isEditing } = data;
  const Icon = TRANSFORM_ICONS[transform.type];
  const colors = TRANSFORM_COLORS[transform.type];
  const summary = getTransformSummary(data);
  const sourceFields = getSourceFields(data);

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-md border-2 shadow-sm transition-all duration-200",
        colors.bg,
        transform.active ? colors.border : "border-muted",
        selected && "ring-cartographic-blue ring-2 ring-offset-2",
        isEditing && "ring-cartographic-terracotta ring-2 ring-offset-2"
      )}
    >
      {/* Input handle (left side) */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn("!h-3 !w-3 !border-2 !border-white transition-colors", colors.text.replace("text-", "!bg-"))}
      />

      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3 py-1.5",
          colors.bg,
          transform.active ? "opacity-100" : "opacity-50"
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-wide">Transform</span>
        {!transform.active && <span className="text-muted-foreground ml-auto text-[9px] uppercase">disabled</span>}
      </div>

      {/* Content */}
      <div className="bg-white px-3 py-2">
        <h4 className="text-foreground font-serif font-semibold">{TRANSFORM_TYPE_LABELS[transform.type]}</h4>

        {summary && (
          <p className={cn("mt-1 truncate font-mono text-xs", colors.text)} title={summary}>
            {summary}
          </p>
        )}

        {/* Source fields indicator */}
        {sourceFields.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sourceFields.slice(0, 3).map((field) => (
              <span
                key={field}
                className="bg-muted text-muted-foreground inline-block rounded px-1.5 py-0.5 font-mono text-[10px]"
              >
                {field}
              </span>
            ))}
            {sourceFields.length > 3 && (
              <span className="bg-muted text-muted-foreground inline-block rounded px-1.5 py-0.5 font-mono text-[10px]">
                +{sourceFields.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Output handle (right side) */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn("!h-3 !w-3 !border-2 !border-white transition-colors", colors.text.replace("text-", "!bg-"))}
      />
    </div>
  );
};

export const TransformNode = memo(TransformNodeComponent);
