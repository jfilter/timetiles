/**
 * Shared constants and components for the column-centric mapping table.
 *
 * Extracted to avoid circular imports between column-mapping-table and column-row.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeftRight, Calendar, CaseSensitive, type LucideIcon, Scissors, Type } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TransformType } from "@/lib/types/ingest-transforms";
import type { FieldMappingStringField } from "@/lib/types/ingest-wizard";

// ---------------------------------------------------------------------------
// Transform icons and colors
// ---------------------------------------------------------------------------

export const TRANSFORM_ICONS: Record<TransformType, LucideIcon> = {
  rename: Type,
  "date-parse": Calendar,
  "string-op": CaseSensitive,
  concatenate: ArrowLeftRight,
  split: Scissors,
};

export const TRANSFORM_COLORS: Record<TransformType, string> = {
  rename: "text-ring",
  "date-parse": "text-secondary",
  "string-op": "text-accent",
  concatenate: "text-primary",
  split: "text-purple-600",
};

// ---------------------------------------------------------------------------
// Target field options
// ---------------------------------------------------------------------------

/** Translation keys used in target option labels. */
type TargetLabelKey =
  | "importedAsIs"
  | "fieldTitle"
  | "fieldDate"
  | "addressLocation"
  | "latitude"
  | "longitude"
  | "fieldDescription"
  | "fieldLocationName"
  | "idField";

export interface TargetOption {
  value: FieldMappingStringField | "__none__";
  labelKey: TargetLabelKey;
  required: boolean;
}

export const TARGET_OPTIONS: TargetOption[] = [
  { value: "__none__", labelKey: "importedAsIs", required: false },
  { value: "titleField", labelKey: "fieldTitle", required: true },
  { value: "dateField", labelKey: "fieldDate", required: true },
  { value: "locationField", labelKey: "addressLocation", required: false },
  { value: "latitudeField", labelKey: "latitude", required: false },
  { value: "longitudeField", labelKey: "longitude", required: false },
  { value: "descriptionField", labelKey: "fieldDescription", required: false },
  { value: "locationNameField", labelKey: "fieldLocationName", required: false },
  { value: "idField", labelKey: "idField", required: false },
];

// ---------------------------------------------------------------------------
// TargetSelect component
// ---------------------------------------------------------------------------

interface TargetSelectProps {
  columnName: string;
  targetField: FieldMappingStringField | null;
  assignedTargets: Set<string>;
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
}

export const TargetSelect = ({
  columnName,
  targetField,
  assignedTargets,
  onTargetChange,
}: Readonly<TargetSelectProps>) => {
  const t = useTranslations("Ingest");

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onTargetChange(columnName, value === "__none__" ? null : (value as FieldMappingStringField));
  };

  return (
    <select
      value={targetField ?? "__none__"}
      onChange={handleChange}
      className={cn(
        "border-primary/20 bg-background text-foreground h-9 w-full min-w-[180px] rounded-sm border px-2 text-sm",
        "focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:ring-offset-1",
        targetField && "border-accent/40 font-medium"
      )}
      aria-label={t("flowTargetField")}
    >
      {TARGET_OPTIONS.map((opt) => {
        const isCurrentTarget = opt.value === targetField;
        const isTaken = opt.value !== "__none__" && assignedTargets.has(opt.value) && !isCurrentTarget;

        return (
          <option key={opt.value} value={opt.value} disabled={isTaken}>
            {t(opt.labelKey)}
            {opt.required ? " *" : ""}
          </option>
        );
      })}
    </select>
  );
};
