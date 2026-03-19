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
import {
  ArrowRight,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  FileSpreadsheetIcon,
  MapPinIcon,
  TextIcon,
  WorkflowIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { Link } from "@/i18n/navigation";
import {
  type ConfidenceLevel,
  type FieldMapping,
  isFieldMappingComplete,
  type SuggestedMappings,
} from "@/lib/types/import-wizard";

import { useWizard } from "../wizard-context";
import {
  DataPreviewSection,
  type FieldSuggestionResult,
  LanguageDetectionBanner,
  type LocationMode,
  LocationSection,
  type PreviewField,
} from "./field-mapping-sections";
import { FieldSelect } from "./field-select";
import { IdStrategyCard } from "./id-strategy-card";
import { SheetTabButton } from "./sheet-tab-button";

export interface StepFieldMappingProps {
  className?: string;
}

/** Derive initial location mode from existing mapping data. */
const deriveLocationMode = (mapping: FieldMapping): LocationMode => {
  if (mapping.latitudeField ?? mapping.longitudeField) return "coordinates";
  return "address";
};

export const StepFieldMapping = ({ className }: Readonly<StepFieldMappingProps>) => {
  const t = useTranslations("Import");
  const { state, nextStep, canProceed, setFieldMapping, setImportOptions } = useWizard();
  const { sheets, fieldMappings, sheetMappings, deduplicationStrategy, geocodingEnabled } = state;

  const [activeSheetIndex, setActiveSheetIndex] = useState(sheets[0]?.index ?? 0);

  const activeSheet = sheets.find((s) => s.index === activeSheetIndex);
  const activeMapping = fieldMappings.find((m) => m.sheetIndex === activeSheetIndex);
  const suggestedMappings = activeSheet?.suggestedMappings;

  const [locationMode, setLocationMode] = useState<LocationMode>(() =>
    activeMapping ? deriveLocationMode(activeMapping) : "address"
  );

  const headers = activeSheet?.headers ?? [];

  const getFieldSuggestion = (fieldName: keyof SuggestedMappings["mappings"]): FieldSuggestionResult => {
    const suggestion = suggestedMappings?.mappings[fieldName];
    return {
      suggestedPath: suggestion?.path ?? null,
      confidenceLevel: suggestion?.confidenceLevel ?? ("none" as ConfidenceLevel),
    };
  };

  const isAutoDetected = (fieldName: keyof SuggestedMappings["mappings"], currentValue: string | null) => {
    const { suggestedPath } = getFieldSuggestion(fieldName);
    return currentValue !== null && currentValue === suggestedPath;
  };

  const handleFieldChange = useCallback(
    (field: keyof FieldMapping, value: string | null) => {
      setFieldMapping(activeSheetIndex, { [field]: value === "" ? null : value });
    },
    [activeSheetIndex, setFieldMapping]
  );

  const handleDeduplicationChange = (value: string) => {
    setImportOptions({ deduplicationStrategy: value as "skip" | "update" | "version" });
  };

  const handleGeocodingCheckedChange = (checked: boolean | "indeterminate") => {
    setImportOptions({ geocodingEnabled: checked === true });
  };

  const handleLocationModeChange = (mode: LocationMode) => {
    setLocationMode(mode);
    if (mode === "address") {
      setFieldMapping(activeSheetIndex, { latitudeField: null, longitudeField: null });
    } else {
      setFieldMapping(activeSheetIndex, { locationField: null });
      setImportOptions({ geocodingEnabled: false });
    }
  };

  // Completion status
  const requiredFieldsCount = useMemo(() => {
    if (!activeMapping) return { mapped: 0, total: 3 };
    let mapped = 0;
    if (activeMapping.titleField) mapped++;
    if (activeMapping.dateField) mapped++;
    const hasLocation = activeMapping.locationField ?? (activeMapping.latitudeField && activeMapping.longitudeField);
    if (hasLocation) mapped++;
    return { mapped, total: 3 };
  }, [activeMapping]);

  const isComplete = activeMapping ? isFieldMappingComplete(activeMapping) : false;

  // Dynamic preview: collect all mapped field labels + column keys
  const mappedPreviewFields = useMemo((): PreviewField[] => {
    if (!activeMapping) return [];
    const fields: PreviewField[] = [];
    if (activeMapping.titleField) fields.push({ label: t("fieldTitle"), columnKey: activeMapping.titleField });
    if (activeMapping.dateField) fields.push({ label: t("fieldDate"), columnKey: activeMapping.dateField, mono: true });
    if (activeMapping.locationField) fields.push({ label: t("location"), columnKey: activeMapping.locationField });
    if (activeMapping.latitudeField)
      fields.push({ label: t("latitude"), columnKey: activeMapping.latitudeField, mono: true });
    if (activeMapping.longitudeField)
      fields.push({ label: t("longitude"), columnKey: activeMapping.longitudeField, mono: true });
    if (activeMapping.descriptionField)
      fields.push({ label: t("fieldDescription"), columnKey: activeMapping.descriptionField });
    if (activeMapping.locationNameField)
      fields.push({ label: t("fieldLocationName"), columnKey: activeMapping.locationNameField });
    return fields;
  }, [activeMapping, t]);

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
        {state.previewId && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/import/flow-editor?previewId=${state.previewId}&sheetIndex=${activeSheetIndex}`}>
              <WorkflowIcon className="mr-2 h-4 w-4" />
              {t("openVisualEditor")}
            </Link>
          </Button>
        )}
      </div>

      <LanguageDetectionBanner suggestedMappings={suggestedMappings} />

      {/* Completion status bar */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-sm px-4 py-2 text-sm",
          isComplete
            ? "border-cartographic-forest/20 bg-cartographic-forest/5 text-cartographic-forest border"
            : "border-cartographic-terracotta/20 bg-cartographic-terracotta/5 text-cartographic-terracotta border"
        )}
      >
        {isComplete ? (
          <>
            <CheckCircleIcon className="h-4 w-4" />
            {t("allRequiredFieldsMapped")}
          </>
        ) : (
          t("requiredFieldsRemaining", { count: requiredFieldsCount.total - requiredFieldsCount.mapped })
        )}
      </div>

      {/* Main card with all field sections */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Required fields section */}
          <div className="border-cartographic-terracotta/30 border-l-4 p-6">
            <h3 className="text-cartographic-charcoal mb-1 font-serif text-lg font-semibold">{t("requiredFields")}</h3>
            <p className="text-cartographic-navy/70 mb-4 text-sm">{t("requiredFieldsDescription")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSelect
                id="title-field"
                label={t("fieldTitle")}
                field="titleField"
                required
                icon={<TextIcon className="h-4 w-4" />}
                value={activeMapping.titleField}
                headers={headers}
                onFieldChange={handleFieldChange}
                confidenceLevel={getFieldSuggestion("titlePath").confidenceLevel}
                isAutoDetected={isAutoDetected("titlePath", activeMapping.titleField)}
                validationMessage={!activeMapping.titleField ? t("fieldRequired") : undefined}
              />
              <FieldSelect
                id="date-field"
                label={t("fieldDate")}
                field="dateField"
                required
                icon={<CalendarIcon className="h-4 w-4" />}
                value={activeMapping.dateField}
                headers={headers}
                onFieldChange={handleFieldChange}
                confidenceLevel={getFieldSuggestion("timestampPath").confidenceLevel}
                isAutoDetected={isAutoDetected("timestampPath", activeMapping.dateField)}
                validationMessage={!activeMapping.dateField ? t("fieldRequired") : undefined}
              />
            </div>
          </div>

          {/* Location fields section */}
          <div className="border-cartographic-navy/10 border-t" />
          <LocationSection
            locationMode={locationMode}
            onLocationModeChange={handleLocationModeChange}
            activeMapping={activeMapping}
            headers={headers}
            geocodingEnabled={geocodingEnabled}
            onFieldChange={handleFieldChange}
            onGeocodingCheckedChange={handleGeocodingCheckedChange}
            getFieldSuggestion={getFieldSuggestion}
            isAutoDetected={isAutoDetected}
          />

          {/* Optional fields section */}
          <div className="border-cartographic-navy/10 border-t" />
          <div className="p-6">
            <h3 className="text-cartographic-charcoal mb-1 font-serif text-lg font-semibold">{t("optionalFields")}</h3>
            <p className="text-cartographic-navy/70 mb-4 text-sm">{t("optionalFieldsDescription")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSelect
                id="description-field"
                label={t("fieldDescription")}
                field="descriptionField"
                required={false}
                icon={<TextIcon className="h-4 w-4" />}
                value={activeMapping.descriptionField}
                headers={headers}
                onFieldChange={handleFieldChange}
                confidenceLevel={getFieldSuggestion("descriptionPath").confidenceLevel}
                isAutoDetected={isAutoDetected("descriptionPath", activeMapping.descriptionField)}
              />
              <FieldSelect
                id="location-name-field"
                label={t("fieldLocationName")}
                field="locationNameField"
                required={false}
                icon={<MapPinIcon className="h-4 w-4" />}
                value={activeMapping.locationNameField}
                headers={headers}
                onFieldChange={handleFieldChange}
                confidenceLevel={getFieldSuggestion("locationNamePath").confidenceLevel}
                isAutoDetected={isAutoDetected("locationNamePath", activeMapping.locationNameField)}
              />
            </div>
          </div>

          {/* Data preview section */}
          <div className="border-cartographic-navy/10 border-t" />
          <DataPreviewSection fields={mappedPreviewFields} sampleData={activeSheet.sampleData} />
        </CardContent>
      </Card>

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
