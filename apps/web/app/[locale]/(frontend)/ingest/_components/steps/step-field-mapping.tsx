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
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { applyPreviewTransforms } from "@/lib/ingest/transforms";
import { type ConfigSuggestion, type FieldMapping, isFieldMappingComplete } from "@/lib/ingest/types/wizard";

import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardFieldMappingStepState } from "../wizard-store";
import { ColumnMappingTable } from "./column-mapping-table";
import {
  CompletionStatusBar,
  ConfigSuggestionBanner,
  DataPreviewSection,
  LanguageDetectionBanner,
} from "./field-mapping-sections";
import { IdStrategyCard } from "./id-strategy-card";
import { SheetTabButton } from "./sheet-tab-button";
import { useFieldMappingCompletion } from "./use-field-mapping-completion";
import { useIdPreview } from "./use-id-preview";

export interface StepFieldMappingProps {
  className?: string;
}

/**
 * Manage config suggestion state (applied/dismissed) keyed per sheet.
 *
 * Uses `useState` for both rendering and as the single source of truth.
 * The effect uses a functional updater to atomically check-and-set the
 * applied state, eliminating the previous `useRef` sync risk.
 */
const useConfigSuggestion = (
  bestSuggestion: ConfigSuggestion | null,
  sheetMappings: { sheetIndex: number; datasetId?: number | "new" }[],
  activeSheetIndex: number,
  applyDatasetConfig: (sheetIndex: number, config: ConfigSuggestion["config"]) => void
) => {
  const [dismissedSheets, setDismissedSheets] = useState<Set<number>>(new Set());
  const [appliedSheets, setAppliedSheets] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!bestSuggestion) return;
    const mapping = sheetMappings.find((m) => m.sheetIndex === activeSheetIndex);
    if (typeof mapping?.datasetId !== "number") return;

    // Functional updater: atomically check if already applied and mark if not.
    // This avoids the previous useRef guard that could drift from state.
    let alreadyApplied = false;
    setAppliedSheets((prev) => {
      if (prev.has(activeSheetIndex)) {
        alreadyApplied = true;
        return prev;
      }
      return new Set(prev).add(activeSheetIndex);
    });
    if (!alreadyApplied) {
      applyDatasetConfig(activeSheetIndex, bestSuggestion.config);
    }
  }, [activeSheetIndex, sheetMappings, bestSuggestion, applyDatasetConfig]);

  const dismissed = dismissedSheets.has(activeSheetIndex);
  const applied = appliedSheets.has(activeSheetIndex);

  return {
    dismissed,
    applied,
    setDismissed: (v: boolean) => {
      setDismissedSheets((prev) => {
        const next = new Set(prev);
        if (v) next.add(activeSheetIndex);
        else next.delete(activeSheetIndex);
        return next;
      });
    },
    setApplied: (v: boolean) => {
      setAppliedSheets((prev) => {
        const next = new Set(prev);
        if (v) next.add(activeSheetIndex);
        else next.delete(activeSheetIndex);
        return next;
      });
    },
  };
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
  const {
    sheets,
    fieldMappings,
    sheetMappings,
    deduplicationStrategy,
    geocodingEnabled,
    previewId,
    transforms,
    configSuggestions,
    nextStep,
    setFieldMapping,
    setImportOptions,
    setTransforms,
    applyDatasetConfig,
    resetToAutoDetected,
  } = useWizardFieldMappingStepState();
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
  const requiredFieldsCount = useFieldMappingCompletion(activeMapping);
  const isComplete = activeMapping ? isFieldMappingComplete(activeMapping) : false;

  // Apply transforms to preview data
  const sheetTransforms = transforms[activeSheetIndex];
  const transformedSampleData = useMemo(
    () => applyPreviewTransforms(activeSheet?.sampleData ?? [], sheetTransforms ?? []),
    [activeSheet?.sampleData, sheetTransforms]
  );

  // Add ID preview column — shows the *source* of each ID, not the actual hash.
  // Real ID generation lives in lib/services/id-generation.ts (uses node:crypto, server-only).
  const previewWithIds = useIdPreview(transformedSampleData, activeMapping, t("contentHashPreview"));

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
        <h2 className="text-foreground font-serif text-3xl font-bold">{t("mapFields")}</h2>
        <p className="text-muted-foreground mt-2">{t("mapFieldsDescription")}</p>
      </div>

      {/* Sheet context bar */}
      <div className="border-primary/10 bg-card/30 flex items-center justify-between rounded-sm border px-4 py-3">
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
              <FileSpreadsheetIcon className="text-muted-foreground h-5 w-5" />
              <span className="text-foreground font-serif font-semibold">
                {sheetMappings.find((m) => m.sheetIndex === activeSheetIndex)?.newDatasetName ?? activeSheet.name}
              </span>
              <span className="text-muted-foreground text-sm">
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
              router.push(`/ingest/flow-editor?previewId=${previewId}&sheetIndex=${activeSheetIndex}`);
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
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between py-2 text-sm font-medium">
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
          <span className={cn("text-sm", isComplete ? "text-accent" : "text-muted-foreground")}>
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
