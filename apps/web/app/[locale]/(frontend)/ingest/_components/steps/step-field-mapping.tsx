/**
 * Field mapping step for the import wizard.
 *
 * Allows users to map source columns to event fields.
 * Consolidated single-card layout with location radio toggle,
 * dynamic data preview, completion status, and sticky continue button.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@timetiles/ui";
import { Button } from "@timetiles/ui/components/button";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowRight, ChevronDownIcon, FileSpreadsheetIcon, WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import { type ConfigSuggestion, type FieldMapping, isFieldMappingComplete } from "@/lib/types/ingest-wizard";

import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardStore } from "../wizard-store";
import { ColumnMappingTable } from "./column-mapping-table";
import {
  CompletionStatusBar,
  ConfigSuggestionBanner,
  DataPreviewSection,
  LanguageDetectionBanner,
} from "./field-mapping-sections";
import { IdStrategyCard } from "./id-strategy-card";
import { SheetTabButton } from "./sheet-tab-button";

export interface StepFieldMappingProps {
  className?: string;
}

/** Manage config suggestion state (applied/dismissed) with auto-apply for existing datasets. */
const useConfigSuggestion = (
  bestSuggestion: ConfigSuggestion | null,
  sheetMappings: { sheetIndex: number; datasetId?: number | "new" }[],
  activeSheetIndex: number,
  applyDatasetConfig: (sheetIndex: number, config: ConfigSuggestion["config"]) => void
) => {
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || !bestSuggestion) return;
    const mapping = sheetMappings.find((m) => m.sheetIndex === activeSheetIndex);
    if (typeof mapping?.datasetId === "number") {
      applyDatasetConfig(activeSheetIndex, bestSuggestion.config);
      appliedRef.current = true;
      setApplied(true);
    }
  }, [activeSheetIndex, sheetMappings, bestSuggestion, applyDatasetConfig]);

  return { dismissed, applied, setDismissed, setApplied };
};

/** Apply a string operation transform for preview. */
export const applyStringOp = (result: Record<string, unknown>, tf: IngestTransform & { type: "string-op" }): void => {
  const v = result[tf.from];
  if (typeof v !== "string") return;
  if (tf.operation === "uppercase") result[tf.from] = v.toUpperCase();
  else if (tf.operation === "lowercase") result[tf.from] = v.toLowerCase();
  else if (tf.operation === "replace" && tf.pattern !== undefined)
    result[tf.from] = v.replaceAll(tf.pattern, tf.replacement ?? "");
};

/** Apply a single transform to a preview row (client-safe, no server deps). */
export const applyOneTransform = (result: Record<string, unknown>, tf: IngestTransform): void => {
  if (tf.type === "string-op") return applyStringOp(result, tf);
  if (tf.type === "rename") {
    const v = result[tf.from];
    if (v !== undefined) {
      result[tf.to] = v;
      delete result[tf.from];
    }
    return;
  }
  if (tf.type === "concatenate") {
    const parts = tf.fromFields.map((f) => result[f]).filter((v) => v != null);
    if (parts.length > 0) result[tf.to] = parts.map(String).join(tf.separator);
    return;
  }
  if (tf.type === "split") {
    const v = result[tf.from];
    if (typeof v !== "string") return;
    const parts = v.split(tf.delimiter);
    for (let i = 0; i < tf.toFields.length && i < parts.length; i++) {
      const field = tf.toFields[i];
      if (field && parts[i] !== undefined) result[field] = parts[i]!.trim();
    }
  }
};

/** Apply transforms to sample data for preview. */
export const applyPreviewTransforms = (
  dataArray: Record<string, unknown>[],
  transforms: IngestTransform[]
): Record<string, unknown>[] => {
  const active = transforms.filter((t) => t.active);
  if (active.length === 0) return dataArray;

  return dataArray.map((row) => {
    const result = { ...row };
    for (const tf of active) applyOneTransform(result, tf);
    return result;
  });
};

/** Check whether the active sheet maps to an existing dataset, locking ID strategy controls. */
const isIdStrategyLocked = (
  sheetMappings: { sheetIndex: number; datasetId?: number | "new" }[],
  activeSheetIndex: number
): boolean => typeof sheetMappings.find((m) => m.sheetIndex === activeSheetIndex)?.datasetId === "number";

// oxlint-disable-next-line eslint(complexity) -- UI component with many conditional rendering branches for multi-sheet, suggestions, and location modes
export const StepFieldMapping = ({ className }: Readonly<StepFieldMappingProps>) => {
  const t = useTranslations("Ingest");
  const router = useRouter();
  const sheets = useWizardStore((s) => s.sheets);
  const fieldMappings = useWizardStore((s) => s.fieldMappings);
  const sheetMappings = useWizardStore((s) => s.sheetMappings);
  const deduplicationStrategy = useWizardStore((s) => s.deduplicationStrategy);
  const geocodingEnabled = useWizardStore((s) => s.geocodingEnabled);
  const previewId = useWizardStore((s) => s.previewId);
  const transforms = useWizardStore((s) => s.transforms);
  const configSuggestions = useWizardStore((s) => s.configSuggestions);
  const nextStep = useWizardStore((s) => s.nextStep);
  const setFieldMapping = useWizardStore((s) => s.setFieldMapping);
  const setImportOptions = useWizardStore((s) => s.setImportOptions);
  const setTransforms = useWizardStore((s) => s.setTransforms);
  const applyDatasetConfig = useWizardStore((s) => s.applyDatasetConfig);
  const resetToAutoDetected = useWizardStore((s) => s.resetToAutoDetected);
  const canProceed = useWizardCanProceed();

  const [activeSheetIndex, setActiveSheetIndex] = useState(sheets[0]?.index ?? 0);

  const activeSheet = sheets.find((s) => s.index === activeSheetIndex);
  const activeMapping = fieldMappings.find((m) => m.sheetIndex === activeSheetIndex);
  const idStrategyLocked = isIdStrategyLocked(sheetMappings, activeSheetIndex);
  const suggestedMappings = activeSheet?.suggestedMappings;

  // Config suggestion state
  const bestSuggestion = configSuggestions.find((s) => s.score >= 60) ?? null;
  const suggestionState = useConfigSuggestion(bestSuggestion, sheetMappings, activeSheetIndex, applyDatasetConfig);

  const headers = useMemo(() => activeSheet?.headers ?? [], [activeSheet?.headers]);

  const handleFieldChange = useCallback(
    (field: keyof FieldMapping, value: string | null) => {
      setFieldMapping(activeSheetIndex, { [field]: value === "" ? null : value });
    },
    [activeSheetIndex, setFieldMapping]
  );

  const handleDeduplicationChange = (value: string) => {
    setImportOptions({ deduplicationStrategy: value as "skip" | "update" | "version" });
  };

  // Completion status
  const requiredFieldsCount = useMemo(() => {
    if (!activeMapping) return { mapped: 0, total: 3, missing: ["fieldTitle", "fieldDate", "location"] };
    const missing: string[] = [];
    if (!activeMapping.titleField) missing.push("fieldTitle");
    if (!activeMapping.dateField) missing.push("fieldDate");
    const hasLocation = activeMapping.locationField ?? (activeMapping.latitudeField && activeMapping.longitudeField);
    if (!hasLocation) missing.push("location");
    return { mapped: 3 - missing.length, total: 3, missing };
  }, [activeMapping]);

  const isComplete = activeMapping ? isFieldMappingComplete(activeMapping) : false;

  // Apply transforms to preview data
  const sheetTransforms = transforms[activeSheetIndex];
  const transformedSampleData = useMemo(
    () => applyPreviewTransforms(activeSheet?.sampleData ?? [], sheetTransforms ?? []),
    [activeSheet?.sampleData, sheetTransforms]
  );

  // Add ID preview column — shows the *source* of each ID, not the actual hash.
  // Real ID generation lives in lib/services/id-generation.ts (uses node:crypto, server-only).
  const previewWithIds = useMemo(() => {
    if (!activeMapping) return transformedSampleData;
    const strategy = activeMapping.idStrategy;
    return transformedSampleData.map((row, i) => {
      let id: string;
      const stringify = (v: unknown): string => (typeof v === "object" ? JSON.stringify(v) : String(v as string));
      if (strategy === "external" && activeMapping.idField) {
        const val = row[activeMapping.idField];
        id = val != null ? stringify(val) : "";
      } else if (strategy === "computed") {
        const parts = [row[activeMapping.titleField ?? ""], row[activeMapping.dateField ?? ""]].filter(Boolean);
        id = parts.length > 0 ? `hash(${parts.map(stringify).join(", ")})` : `row-${i + 1}`;
      } else if (strategy === "hybrid" && activeMapping.idField) {
        const val = row[activeMapping.idField];
        id = val != null ? stringify(val) : "hash(...)";
      } else {
        id = `auto-${i + 1}`;
      }
      return { __id: id, ...row };
    });
  }, [transformedSampleData, activeMapping]);

  // Build preview fields from transformed data (includes new columns from transforms)
  const allPreviewFields = useMemo(() => {
    const dataKeys = [...new Set([...headers, ...previewWithIds.flatMap(Object.keys)])].filter((k) => k !== "__id");
    const idField = { label: "ID", columnKey: "__id", mono: true };
    return [idField, ...dataKeys.map((h) => ({ label: h, columnKey: h }))];
  }, [headers, previewWithIds]);

  if (!activeSheet || !activeMapping) {
    return (
      <div className={cn("py-12 text-center", className)}>
        <p className="text-muted-foreground">{t("noDataAvailable")}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("mapFields")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("mapFieldsDescription")}</p>
      </div>

      {/* Sheet context bar */}
      <div className="border-cartographic-navy/10 bg-cartographic-cream/30 flex items-center justify-between rounded-sm border px-4 py-3">
        <div className="flex items-center gap-4">
          {sheets.length > 1 ? (
            <div className="flex flex-wrap gap-2" data-testid="sheet-tabs">
              {sheets.map((sheet) => {
                const mapping = fieldMappings.find((m) => m.sheetIndex === sheet.index);
                const sheetComplete = isFieldMappingComplete(mapping);
                const isActive = sheet.index === activeSheetIndex;
                const sheetMapping = sheetMappings.find((m) => m.sheetIndex === sheet.index);

                return (
                  <SheetTabButton
                    key={sheet.index}
                    sheetIndex={sheet.index}
                    displayName={sheetMapping?.newDatasetName ?? sheet.name}
                    rowCount={sheet.rowCount}
                    isComplete={sheetComplete}
                    isActive={isActive}
                    onSelect={setActiveSheetIndex}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <FileSpreadsheetIcon className="text-cartographic-navy/50 h-5 w-5" />
              <span className="text-cartographic-charcoal font-serif font-semibold">
                {sheetMappings.find((m) => m.sheetIndex === activeSheetIndex)?.newDatasetName ?? activeSheet.name}
              </span>
              <span className="text-cartographic-navy/50 text-sm">
                {t("rowCount", { count: (activeSheet.rowCount ?? 0).toLocaleString() })}
              </span>
            </div>
          )}
        </div>
        {previewId && activeMapping && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              router.push(`/import/flow-editor?previewId=${previewId}&sheetIndex=${activeSheetIndex}`);
            }}
          >
            <WorkflowIcon className="mr-2 h-4 w-4" />
            {t("openVisualEditor")}
          </Button>
        )}
      </div>

      <LanguageDetectionBanner suggestedMappings={suggestedMappings} />

      {bestSuggestion && !suggestionState.dismissed && (
        <ConfigSuggestionBanner
          suggestion={bestSuggestion}
          isApplied={suggestionState.applied}
          onApply={() => {
            applyDatasetConfig(activeSheetIndex, bestSuggestion.config);
            suggestionState.setApplied(true);
          }}
          onReset={() => {
            resetToAutoDetected(activeSheetIndex);
            suggestionState.setApplied(false);
          }}
          onIgnore={() => suggestionState.setDismissed(true)}
        />
      )}

      <CompletionStatusBar
        isComplete={isComplete}
        remainingCount={requiredFieldsCount.total - requiredFieldsCount.mapped}
        missingFields={requiredFieldsCount.missing}
      />

      {/* Column mapping table — all columns with inline transforms */}
      <ColumnMappingTable
        headers={headers}
        sampleData={activeSheet.sampleData}
        fieldMapping={activeMapping}
        transforms={transforms[activeSheetIndex] ?? []}
        suggestedMappings={suggestedMappings}
        geocodingEnabled={geocodingEnabled}
        onFieldMappingChange={handleFieldChange}
        onTransformsChange={(newTransforms) => setTransforms(activeSheetIndex, newTransforms)}
        onGeocodingChange={(enabled) => setImportOptions({ geocodingEnabled: enabled })}
      />

      {/* Data preview — shows transformed sample data */}
      {activeSheet.sampleData.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <DataPreviewSection fields={allPreviewFields} sampleData={previewWithIds} />
          </CardContent>
        </Card>
      )}

      {/* Advanced settings collapsible */}
      <Collapsible>
        <CollapsibleTrigger className="text-cartographic-navy/70 hover:text-cartographic-charcoal flex w-full items-center justify-between py-2 text-sm font-medium">
          {t("advancedSettings")}
          <ChevronDownIcon className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2">
            <IdStrategyCard
              bare
              locked={idStrategyLocked}
              idStrategy={activeMapping.idStrategy}
              idField={activeMapping.idField}
              headers={headers}
              deduplicationStrategy={deduplicationStrategy}
              onFieldChange={handleFieldChange}
              onDeduplicationChange={handleDeduplicationChange}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Sticky continue button */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm", isComplete ? "text-cartographic-forest" : "text-cartographic-navy/50")}>
            {isComplete ? t("readyToContinue") : t("completeRequiredFields")}
          </span>
          <Button size="lg" onClick={nextStep} disabled={!canProceed} className="gap-2">
            {t("continueToReview")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
