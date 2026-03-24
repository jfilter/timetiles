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
import { useTranslations } from "next-intl";
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

const TYPE_BADGE_CLASSES: Record<SourceColumnNodeData["inferredType"], string> = {
  string: "bg-ring/10 text-ring",
  number: "bg-accent/10 text-accent",
  date: "bg-secondary/10 text-secondary",
  boolean: "bg-primary/10 text-primary",
  mixed: "bg-muted text-muted-foreground",
};

const TYPE_BADGE_KEYS = {
  string: "flowTypeText",
  number: "flowTypeNumber",
  date: "flowTypeDate",
  boolean: "flowTypeBoolean",
  mixed: "flowTypeMixed",
} as const;

const SourceColumnNodeComponent = ({ data, selected }: Readonly<SourceColumnNodeProps>) => {
  const t = useTranslations("Ingest");
  const badgeClassName = TYPE_BADGE_CLASSES[data.inferredType];
  const badgeLabelKey = TYPE_BADGE_KEYS[data.inferredType];

  return (
    <div
      className={cn(
        "bg-card min-w-[180px] rounded-sm border-2 shadow-sm transition-all duration-200",
        data.isConnected ? "border-accent" : "border-primary/30",
        selected && "ring-ring ring-2 ring-offset-2"
      )}
    >
      {/* Header */}
      <div className="border-primary/20 bg-primary/5 flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
          {t("flowSourceColumn")}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", badgeClassName)}>{t(badgeLabelKey)}</span>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        <h4 className="text-foreground font-serif font-semibold">{data.columnName}</h4>

        {/* Sample values */}
        {data.sampleValues.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {/* eslint-disable @eslint-react/no-array-index-key -- sample values may not be unique, index needed for stable keys */}
            {data.sampleValues.slice(0, 2).map((value, index) => {
              const displayValue = toDisplayString(value);
              return (
                <div
                  key={`sample-${index}-${displayValue}`}
                  className="text-muted-foreground truncate font-mono text-xs"
                  title={displayValue}
                >
                  {displayValue === "" ? (
                    <span className="italic">{t("flowEmpty")}</span>
                  ) : (
                    displayValue.substring(0, 30)
                  )}
                </div>
              );
            })}
            {/* eslint-enable @eslint-react/no-array-index-key */}
          </div>
        )}
      </div>

      {/* Output handle (right side) */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "!bg-primary !h-3 !w-3 !border-2 !border-white transition-colors",
          data.isConnected && "!bg-accent"
        )}
      />
    </div>
  );
};

export const SourceColumnNode = memo(SourceColumnNodeComponent);
