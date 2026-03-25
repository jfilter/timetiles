/**
 * Transform chip component for the column-centric mapping table.
 *
 * Renders a compact badge for an applied transform with expand/remove actions.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@timetiles/ui/components/dropdown-menu";
import { cn } from "@timetiles/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { TRANSFORM_TYPE_LABELS, type TransformType } from "@/lib/types/ingest-transforms";
import type { IngestTransform } from "@/lib/types/ingest-wizard";

import { TRANSFORM_COLORS, TRANSFORM_ICONS } from "./column-mapping-shared";

// ---------------------------------------------------------------------------
// getTransformChipLabel
// ---------------------------------------------------------------------------

/** Short label for a transform chip. */
export const getTransformChipLabel = (
  transform: IngestTransform,
  t: (key: string, values?: Record<string, unknown>) => string
): string => {
  switch (transform.type) {
    case "rename":
      return transform.to ? t("tfChipRename", { name: transform.to }) : t("tfChipRenameDefault");
    case "date-parse":
      return transform.inputFormat ? t("tfChipDate", { format: transform.inputFormat }) : t("tfChipDateDefault");
    case "string-op":
      return transform.operation.charAt(0).toUpperCase() + transform.operation.slice(1);
    case "concatenate":
      return t("tfChipJoin", { count: transform.fromFields.length });
    case "split":
      return t("tfChipSplit", { count: transform.toFields.length });
  }
};

// ---------------------------------------------------------------------------
// TransformChip
// ---------------------------------------------------------------------------

export interface TransformChipProps {
  transform: IngestTransform;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

export const TransformChip = ({ transform, isExpanded, onToggle, onRemove }: Readonly<TransformChipProps>) => {
  const t = useTranslations("Ingest");
  const Icon = TRANSFORM_ICONS[transform.type];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs",
        isExpanded
          ? "border-primary/30 bg-primary/5 ring-ring ring-1"
          : "border-primary/15 bg-card/30 hover:bg-card/60",
        !transform.active && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1"
        aria-expanded={isExpanded}
        aria-label={TRANSFORM_TYPE_LABELS[transform.type]}
      >
        <Icon className={cn("h-3 w-3", TRANSFORM_COLORS[transform.type])} />
        <span className="text-foreground max-w-[120px] truncate">
          {getTransformChipLabel(transform, t as (key: string, values?: Record<string, unknown>) => string)}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive -mr-0.5 ml-0.5 rounded-sm p-0.5"
        aria-label={t("removeTransform")}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
};

// ---------------------------------------------------------------------------
// AddTransformMenu
// ---------------------------------------------------------------------------

export interface AddTransformMenuProps {
  columnName: string;
  onAdd: (columnName: string, type: TransformType) => void;
  /** Subset of transform types to offer. Defaults to all except concatenate. */
  types?: TransformType[];
}

const DEFAULT_TRANSFORM_TYPES: TransformType[] = ["rename", "date-parse", "string-op", "split"];

/** Dropdown that adds a new transform to a column. Subset of types via `types` prop. */
export const AddTransformMenu = ({
  columnName,
  onAdd,
  types = DEFAULT_TRANSFORM_TYPES,
}: Readonly<AddTransformMenuProps>) => {
  const t = useTranslations("Ingest");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs"
          aria-label={t("addTransformToColumn")}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {types.map((type) => {
          const Icon = TRANSFORM_ICONS[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onAdd(columnName, type)}>
              <Icon className={cn("mr-2 h-4 w-4", TRANSFORM_COLORS[type])} />
              {TRANSFORM_TYPE_LABELS[type]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
