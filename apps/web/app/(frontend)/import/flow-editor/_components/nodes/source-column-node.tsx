/**
 * Source column node for the flow editor.
 *
 * Represents a column from the uploaded file. Displays the column name,
 * sample values, and inferred data type.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";

import type { SourceColumnNodeData } from "@/lib/types/flow-mapping";

interface SourceColumnNodeProps {
  data: SourceColumnNodeData;
  selected?: boolean;
}

/**
 * Safely convert a value to a displayable string
 */
const toDisplayString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return "[complex value]";
  }
};

const TYPE_BADGES: Record<SourceColumnNodeData["inferredType"], { label: string; className: string }> = {
  string: { label: "Text", className: "bg-cartographic-blue/10 text-cartographic-blue" },
  number: { label: "Number", className: "bg-cartographic-forest/10 text-cartographic-forest" },
  date: { label: "Date", className: "bg-cartographic-terracotta/10 text-cartographic-terracotta" },
  boolean: { label: "Boolean", className: "bg-cartographic-navy/10 text-cartographic-navy" },
  mixed: { label: "Mixed", className: "bg-muted text-muted-foreground" },
};

const SourceColumnNodeComponent = ({ data, selected }: Readonly<SourceColumnNodeProps>) => {
  const typeBadge = TYPE_BADGES[data.inferredType];

  return (
    <div
      className={cn(
        "bg-cartographic-cream min-w-[180px] rounded-sm border-2 shadow-sm transition-all duration-200",
        data.isConnected ? "border-cartographic-forest" : "border-cartographic-navy/30",
        selected && "ring-cartographic-blue ring-2 ring-offset-2"
      )}
    >
      {/* Header */}
      <div className="border-cartographic-navy/20 bg-cartographic-navy/5 flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-cartographic-navy/60 font-mono text-[10px] tracking-wide uppercase">Source Column</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", typeBadge.className)}>
          {typeBadge.label}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        <h4 className="text-cartographic-charcoal font-serif font-semibold">{data.columnName}</h4>

        {/* Sample values */}
        {data.sampleValues.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {data.sampleValues.slice(0, 2).map((value, index) => {
              const displayValue = toDisplayString(value);
              return (
                <div key={index} className="text-cartographic-navy/50 truncate font-mono text-xs" title={displayValue}>
                  {displayValue === "" ? <span className="italic">empty</span> : displayValue.substring(0, 30)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Output handle (right side) */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "!bg-cartographic-navy !h-3 !w-3 !border-2 !border-white transition-colors",
          data.isConnected && "!bg-cartographic-forest"
        )}
      />
    </div>
  );
};

export const SourceColumnNode = memo(SourceColumnNodeComponent);
