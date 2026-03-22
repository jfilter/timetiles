/**
 * Field select component for mapping source columns to event fields.
 *
 * @module
 * @category Components
 */
"use client";

import { Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import { CheckCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ConfidenceLevel, FieldMapping } from "@/lib/types/ingest-wizard";

/**
 * Confidence badge component showing auto-detection confidence level.
 */
export const ConfidenceBadge = ({ level, className }: Readonly<{ level: ConfidenceLevel; className?: string }>) => {
  const t = useTranslations("Ingest");

  if (level === "none") return null;

  const styles = {
    high: "bg-cartographic-forest/10 text-cartographic-forest",
    medium: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    low: "bg-muted text-muted-foreground",
  };

  const labels = { high: t("confidenceAutoDetected"), medium: t("confidenceSuggested"), low: t("confidenceBestGuess") };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
        styles[level],
        className
      )}
      data-testid={`confidence-badge-${level}`}
    >
      {level === "high" && <CheckCircleIcon className="h-3 w-3" />}
      {labels[level]}
    </span>
  );
};

export interface FieldSelectProps {
  id: string;
  label: string;
  field: keyof FieldMapping;
  required: boolean;
  icon: React.ReactNode;
  value: string | null;
  headers: string[];
  onFieldChange: (field: keyof FieldMapping, value: string | null) => void;
  disabled?: boolean;
  /** Confidence level from auto-detection */
  confidenceLevel?: ConfidenceLevel;
  /** Whether the current value matches the auto-detected suggestion */
  isAutoDetected?: boolean;
  /** Inline validation message shown below the select */
  validationMessage?: string;
}

export const FieldSelect = ({
  id,
  label,
  field,
  required,
  icon,
  value,
  headers,
  onFieldChange,
  disabled = false,
  confidenceLevel,
  isAutoDetected = false,
  validationMessage,
}: Readonly<FieldSelectProps>) => {
  const t = useTranslations("Ingest");
  const handleValueChange = (val: string) => onFieldChange(field, val === "__none__" ? null : val);

  return (
    <div className="space-y-2" data-testid={`field-mapping-row-${field}`}>
      <Label htmlFor={id} className="text-cartographic-charcoal flex min-h-6 items-center gap-2">
        {icon && <span className="text-cartographic-navy/50">{icon}</span>}
        {label}
        {required && <span className="text-cartographic-terracotta">*</span>}
        {isAutoDetected && confidenceLevel && confidenceLevel !== "none" && <ConfidenceBadge level={confidenceLevel} />}
      </Label>
      <Select value={value ?? "__none__"} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn(
            "h-11",
            required && !value && "border-cartographic-terracotta/50",
            isAutoDetected && confidenceLevel === "high" && "border-cartographic-forest/40 border-dashed",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <SelectValue placeholder={t("selectColumn")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("selectColumn")}</SelectItem>
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {validationMessage && <p className="text-cartographic-terracotta text-xs">{validationMessage}</p>}
    </div>
  );
};
