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
import { useTranslations } from "next-intl";
import { memo } from "react";

import type { TransformNodeData } from "@/lib/ingest/types/flow-mapping";
import type { TransformType } from "@/lib/ingest/types/transforms";

import { TRANSFORM_ICONS } from "../../../_components/steps/column-mapping-shared";

interface TransformNodeProps {
  data: TransformNodeData;
  selected?: boolean;
}

const TRANSFORM_NODE_COLORS: Record<TransformType, { bg: string; border: string; text: string }> = {
  rename: { bg: "bg-ring/5", border: "border-ring/50", text: "text-ring" },
  "date-parse": { bg: "bg-secondary/5", border: "border-secondary/50", text: "text-secondary" },
  "string-op": { bg: "bg-accent/5", border: "border-accent/50", text: "text-accent" },
  concatenate: { bg: "bg-primary/5", border: "border-primary/50", text: "text-primary" },
  split: { bg: "bg-purple-500/5", border: "border-purple-500/50", text: "text-purple-600" },
  "parse-json-array": { bg: "bg-teal-500/5", border: "border-teal-500/50", text: "text-teal-600" },
  "split-to-array": { bg: "bg-violet-500/5", border: "border-violet-500/50", text: "text-violet-600" },
  extract: { bg: "bg-orange-500/5", border: "border-orange-500/50", text: "text-orange-600" },
};

const TRANSFORM_LABEL_KEYS = {
  rename: "flowTransformRename",
  "date-parse": "flowTransformDateParse",
  "string-op": "flowTransformStringOp",
  concatenate: "flowTransformConcatenate",
  split: "flowTransformSplit",
  "parse-json-array": "flowTransformParseJsonArray",
  "split-to-array": "flowTransformSplitToArray",
  extract: "flowTransformExtract",
} as const satisfies Record<TransformType, string>;

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
    case "parse-json-array":
      return `${transform.from} → array`;
    case "split-to-array":
      return `${transform.from} → array`;
    case "extract":
      return `${transform.from} → ${transform.to}`;
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
    case "parse-json-array":
    case "split-to-array":
    case "extract":
      return [transform.from];
    case "concatenate":
      return transform.fromFields;
  }
};

const TransformNodeComponent = ({ data, selected }: Readonly<TransformNodeProps>) => {
  const t = useTranslations("Ingest");
  const { transform, isEditing } = data;
  const Icon = TRANSFORM_ICONS[transform.type];
  const colors = TRANSFORM_NODE_COLORS[transform.type];
  const labelKey = TRANSFORM_LABEL_KEYS[transform.type];
  const summary = getTransformSummary(data);
  const sourceFields = getSourceFields(data);

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-md border-2 shadow-sm transition-all duration-200",
        colors.bg,
        transform.active ? colors.border : "border-muted",
        selected && "ring-ring ring-2 ring-offset-2",
        isEditing && "ring-secondary ring-2 ring-offset-2"
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
        <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
          {t("flowTransform")}
        </span>
        {!transform.active && (
          <span className="text-muted-foreground ml-auto text-[9px] uppercase">{t("flowDisabled")}</span>
        )}
      </div>

      {/* Content */}
      <div className="bg-white px-3 py-2">
        <h4 className="text-foreground font-serif font-semibold">{t(labelKey)}</h4>

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
