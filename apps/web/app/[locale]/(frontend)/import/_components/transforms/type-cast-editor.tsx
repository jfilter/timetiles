/**
 * Type-cast transform editor sub-component.
 *
 * @module
 * @category Components
 */
"use client";

import { Input } from "@timetiles/ui/components/input";
import { Label } from "@timetiles/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { useTranslations } from "next-intl";
import type React from "react";

import {
  CAST_STRATEGY_LABELS,
  CASTABLE_TYPE_LABELS,
  type CastableType,
  type CastStrategy,
  type ImportTransform,
} from "@/lib/types/import-transforms";

interface TypeCastEditorProps {
  from: string;
  fromType: CastableType;
  toType: CastableType;
  strategy: CastStrategy;
  customFunction?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

export const TypeCastEditor = ({
  from,
  fromType,
  toType,
  strategy,
  customFunction,
  sourceColumns,
  onChange,
}: Readonly<TypeCastEditorProps>) => {
  const t = useTranslations("Import");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleStrategyChange = (value: string) => onChange({ strategy: value as CastStrategy });
  const handleFromTypeChange = (value: string) => onChange({ fromType: value as CastableType });
  const handleToTypeChange = (value: string) => onChange({ toType: value as CastableType });
  const handleCustomFunctionChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ customFunction: e.target.value || undefined });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="from">{t("tfSourceField")}</Label>
          <Select value={from} onValueChange={handleFromChange}>
            <SelectTrigger id="from" className="h-11">
              <SelectValue placeholder={t("tfSelectField")} />
            </SelectTrigger>
            <SelectContent>
              {sourceColumns.map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="strategy">{t("tfConversionStrategy")}</Label>
          <Select value={strategy} onValueChange={handleStrategyChange}>
            <SelectTrigger id="strategy" className="h-11">
              <SelectValue placeholder={t("tfSelectStrategy")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CAST_STRATEGY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fromType">{t("tfFromType")}</Label>
          <Select value={fromType} onValueChange={handleFromTypeChange}>
            <SelectTrigger id="fromType" className="h-11">
              <SelectValue placeholder={t("tfSelectType")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CASTABLE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="toType">{t("tfToType")}</Label>
          <Select value={toType} onValueChange={handleToTypeChange}>
            <SelectTrigger id="toType" className="h-11">
              <SelectValue placeholder={t("tfSelectType")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CASTABLE_TYPE_LABELS)
                .filter(([value]) => value !== "null")
                .map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {strategy === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="customFunction">{t("tfCustomExpression")}</Label>
          <Input
            id="customFunction"
            value={customFunction ?? ""}
            onChange={handleCustomFunctionChange}
            placeholder={t("tfCustomExpressionPlaceholder")}
          />
          <p className="text-muted-foreground text-xs">{t("tfCustomExpressionHint")}</p>
        </div>
      )}
    </div>
  );
};
