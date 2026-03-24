/**
 * Target field node for the flow editor.
 *
 * Represents a destination field in the event schema. Displays the field
 * label, icon, and connected source column.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { Handle, Position } from "@xyflow/react";
import { Building, Calendar, FileText, Hash, type LucideIcon, MapPin, Text } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import type { TargetFieldNodeData } from "@/lib/types/flow-mapping";

interface TargetFieldNodeProps {
  data: TargetFieldNodeData;
  selected?: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Text: Text,
  Calendar: Calendar,
  MapPin: MapPin,
  FileText: FileText,
  Building: Building,
  Hash: Hash,
};

const getBorderClass = (isConnected: boolean, required: boolean): string => {
  if (isConnected) return "border-accent";
  if (required) return "border-secondary/50";
  return "border-border";
};

const TargetFieldNodeComponent = ({ data, selected }: Readonly<TargetFieldNodeProps>) => {
  const t = useTranslations("Ingest");
  const Icon = ICON_MAP[data.icon] ?? Text;
  const borderClass = getBorderClass(data.isConnected, data.required);

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-sm border-2 bg-white shadow-sm transition-all duration-200",
        borderClass,
        selected && "ring-ring ring-2 ring-offset-2"
      )}
    >
      {/* Input handle (left side) */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          "!bg-primary !h-3 !w-3 !border-2 !border-white transition-colors",
          data.isConnected && "!bg-accent"
        )}
      />

      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3 py-1.5",
          data.required ? "border-secondary/20 bg-secondary/5" : "border-border bg-muted/30"
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", data.required ? "text-secondary" : "text-accent")} />
        <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
          {t("flowTargetField")}
          {data.required && <span className="text-secondary ml-1">*</span>}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        <h4 className="text-foreground font-serif font-semibold">{data.label}</h4>

        {data.isConnected && data.connectedColumn ? (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-accent text-xs">←</span>
            <span className="text-accent truncate font-mono text-xs">{data.connectedColumn}</span>
          </div>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">{data.description}</p>
        )}
      </div>
    </div>
  );
};

export const TargetFieldNode = memo(TargetFieldNodeComponent);
