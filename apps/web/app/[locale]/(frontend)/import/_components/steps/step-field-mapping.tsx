/**
 * Field mapping step for the import wizard.
 *
 * Allows users to map source columns to event fields.
 * Shows required fields (title, date, location) and optional fields.
 * Includes ID strategy selection for deduplication.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Card,
  CardContent,
  Checkbox,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@timetiles/ui";
import { Button } from "@timetiles/ui/components/button";
import { cn } from "@timetiles/ui/lib/utils";
import {
  ArrowRight,
  CalendarIcon,
  FileSpreadsheetIcon,
  MapPinIcon,
  SparklesIcon,
  TableIcon,
  TextIcon,
  WorkflowIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";
import {
  type ConfidenceLevel,
  type FieldMapping,
  isFieldMappingComplete,
  type SuggestedMappings,
} from "@/lib/types/import-wizard";

import { useWizard } from "../wizard-context";
import { FieldSelect } from "./field-select";
import { IdStrategyCard } from "./id-strategy-card";
import { SheetTabButton } from "./sheet-tab-button";

/**
 * Language detection banner showing the detected language.
 */
const LanguageDetectionBanner = ({
  suggestedMappings,
}: Readonly<{ suggestedMappings: SuggestedMappings | undefined }>) => {
  const t = useTranslations("Import");

  if (!suggestedMappings?.language) return null;

  const { language } = suggestedMappings;

  return (
    <div
      className="border-cartographic-forest/20 bg-cartographic-forest/5 flex items-center gap-3 rounded-sm border px-4 py-3"
      data-testid="language-detection-banner"
    >
      <div className="bg-cartographic-forest/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm">
        <SparklesIcon className="text-cartographic-forest h-4 w-4" />
      </div>
      <div>
        <p className="text-cartographic-charcoal text-sm font-medium">
          {t("autoDetected", { language: language.name })}
          {language.isReliable && (
            <span className="text-cartographic-navy/50 ml-2 font-mono text-xs">
              {Math.round(language.confidence * 100)}%
            </span>
          )}
        </p>
        <p className="text-cartographic-navy/70 text-xs">{t("fieldsMappedAutomatically")}</p>
      </div>
    </div>
  );
};

export interface StepFieldMappingProps {
  className?: string;
}

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
};

export const StepFieldMapping = ({ className }: Readonly<StepFieldMappingProps>) => {
  const t = useTranslations("Import");
  const { state, nextStep, canProceed, setFieldMapping, setImportOptions } = useWizard();
  const { sheets, fieldMappings, sheetMappings, deduplicationStrategy, geocodingEnabled } = state;

  // State for active sheet tab (for multi-sheet files)
  const [activeSheetIndex, setActiveSheetIndex] = useState(sheets[0]?.index ?? 0);

  const activeSheet = sheets.find((s) => s.index === activeSheetIndex);
  const activeMapping = fieldMappings.find((m) => m.sheetIndex === activeSheetIndex);
  const suggestedMappings = activeSheet?.suggestedMappings;

  const headers = activeSheet?.headers ?? [];

  // Helper to check if current value matches auto-detected suggestion
  const getFieldSuggestion = (fieldName: keyof SuggestedMappings["mappings"]) => {
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

  const handleFieldChange = (field: keyof FieldMapping, value: string | null) => {
    setFieldMapping(activeSheetIndex, { [field]: value === "" ? null : value });
  };

  const handleDeduplicationChange = (value: string) => {
    setImportOptions({ deduplicationStrategy: value as "skip" | "update" | "version" });
  };

  const handleGeocodingChange = (enabled: boolean) => {
    setImportOptions({ geocodingEnabled: enabled });
  };

  const handleGeocodingCheckedChange = (checked: boolean | "indeterminate") => {
    handleGeocodingChange(checked === true);
  };

  if (!activeSheet || !activeMapping) {
    return (
      <div className={cn("py-12 text-center", className)}>
        <p className="text-muted-foreground">{t("noDataAvailable")}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("mapFields")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("mapFieldsDescription")}</p>
      </div>

      {/* Active sheet indicator + visual editor link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheetIcon className="text-cartographic-navy/50 h-5 w-5" />
          <span className="text-cartographic-charcoal font-serif font-semibold">
            {sheetMappings.find((m) => m.sheetIndex === activeSheetIndex)?.newDatasetName ?? activeSheet?.name}
          </span>
          <span className="text-cartographic-navy/50 text-sm">
            {t("rowCount", { count: (activeSheet?.rowCount ?? 0).toLocaleString() })}
          </span>
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

      {/* Language detection banner */}
      <LanguageDetectionBanner suggestedMappings={suggestedMappings} />

      {/* Sheet tabs for multi-sheet files */}
      {sheets.length > 1 && (
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 rounded-sm border p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheetIcon className="text-cartographic-navy/50 h-5 w-5" />
            <p className="text-cartographic-navy/70 text-sm">{t("sheetsDetected", { count: sheets.length })}</p>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="sheet-tabs">
            {sheets.map((sheet) => {
              const mapping = fieldMappings.find((m) => m.sheetIndex === sheet.index);
              const isComplete = isFieldMappingComplete(mapping);
              const isActive = sheet.index === activeSheetIndex;
              const sheetMapping = sheetMappings.find((m) => m.sheetIndex === sheet.index);

              return (
                <SheetTabButton
                  key={sheet.index}
                  sheetIndex={sheet.index}
                  displayName={sheetMapping?.newDatasetName ?? sheet.name}
                  rowCount={sheet.rowCount}
                  isComplete={isComplete}
                  isActive={isActive}
                  onSelect={setActiveSheetIndex}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Required fields */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-cartographic-terracotta/10 flex h-10 w-10 items-center justify-center rounded-sm">
              <TextIcon className="text-cartographic-terracotta h-5 w-5" />
            </div>
            <div>
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("requiredFields")}</h3>
              <p className="text-cartographic-navy/70 text-sm">{t("requiredFieldsDescription")}</p>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
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
          />
        </CardContent>
      </Card>

      {/* Location fields */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-cartographic-blue/10 flex h-10 w-10 items-center justify-center rounded-sm">
              <MapPinIcon className="text-cartographic-blue h-5 w-5" />
            </div>
            <div>
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("location")}</h3>
              <p className="text-cartographic-navy/70 text-sm">{t("locationDescription")}</p>
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 p-6">
          <FieldSelect
            id="location-field"
            label={t("addressLocation")}
            field="locationField"
            required={false}
            icon={null}
            value={activeMapping.locationField}
            headers={headers}
            onFieldChange={handleFieldChange}
            confidenceLevel={getFieldSuggestion("locationPath").confidenceLevel}
            isAutoDetected={isAutoDetected("locationPath", activeMapping.locationField)}
          />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="border-cartographic-navy/10 w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="text-cartographic-navy/50 bg-white px-3">{t("orUseCoordinates")}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              id="latitude-field"
              label={t("latitude")}
              field="latitudeField"
              required={false}
              icon={null}
              value={activeMapping.latitudeField}
              headers={headers}
              onFieldChange={handleFieldChange}
              disabled={!!activeMapping.locationField}
              confidenceLevel={getFieldSuggestion("latitudePath").confidenceLevel}
              isAutoDetected={isAutoDetected("latitudePath", activeMapping.latitudeField)}
            />
            <FieldSelect
              id="longitude-field"
              label={t("longitude")}
              field="longitudeField"
              required={false}
              icon={null}
              value={activeMapping.longitudeField}
              headers={headers}
              onFieldChange={handleFieldChange}
              disabled={!!activeMapping.locationField}
              confidenceLevel={getFieldSuggestion("longitudePath").confidenceLevel}
              isAutoDetected={isAutoDetected("longitudePath", activeMapping.longitudeField)}
            />
          </div>

          {!activeMapping.locationField && !activeMapping.latitudeField && !activeMapping.longitudeField && (
            <p className="text-cartographic-terracotta text-sm">{t("locationRequired")}</p>
          )}

          {/* Geocoding option - only show when using address field */}
          {activeMapping.locationField && (
            <div className="border-cartographic-blue/20 bg-cartographic-blue/5 flex items-start gap-3 rounded-sm border p-4">
              <Checkbox
                id="geocoding-enabled"
                checked={geocodingEnabled}
                onCheckedChange={handleGeocodingCheckedChange}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="geocoding-enabled" className="text-cartographic-charcoal">
                  {t("enableGeocoding")}
                </Label>
                <p className="text-cartographic-navy/70 text-sm">{t("enableGeocodingDescription")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Optional fields */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-cartographic-forest/10 flex h-10 w-10 items-center justify-center rounded-sm">
              <SparklesIcon className="text-cartographic-forest h-5 w-5" />
            </div>
            <div>
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("optionalFields")}</h3>
              <p className="text-cartographic-navy/70 text-sm">{t("optionalFieldsDescription")}</p>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
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
        </CardContent>
      </Card>

      {/* ID Strategy & Duplicates */}
      <IdStrategyCard
        idStrategy={activeMapping.idStrategy}
        idField={activeMapping.idField}
        headers={headers}
        deduplicationStrategy={deduplicationStrategy}
        onFieldChange={handleFieldChange}
        onDeduplicationChange={handleDeduplicationChange}
      />

      {/* Data preview */}
      {activeSheet.sampleData.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-cartographic-navy/10 flex h-10 w-10 items-center justify-center rounded-sm">
                <TableIcon className="text-cartographic-navy h-5 w-5" />
              </div>
              <div>
                <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("preview")}</h3>
                <p className="text-cartographic-navy/70 text-sm">{t("previewDescription")}</p>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-cartographic-navy/10 bg-cartographic-cream/20">
                    {activeMapping.titleField && (
                      <TableHead className="text-cartographic-charcoal font-medium">{t("fieldTitle")}</TableHead>
                    )}
                    {activeMapping.dateField && (
                      <TableHead className="text-cartographic-charcoal font-medium">{t("fieldDate")}</TableHead>
                    )}
                    {activeMapping.locationField && (
                      <TableHead className="text-cartographic-charcoal font-medium">{t("location")}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSheet.sampleData.slice(0, 3).map((row, i) => (
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- sample data rows have no unique ID
                    <TableRow key={`preview-row-${i}`} className="border-cartographic-navy/5 last:border-0">
                      {activeMapping.titleField && (
                        <TableCell className="text-cartographic-charcoal">
                          {formatCellValue(row[activeMapping.titleField])}
                        </TableCell>
                      )}
                      {activeMapping.dateField && (
                        <TableCell className="text-cartographic-navy/70 font-mono">
                          {formatCellValue(row[activeMapping.dateField])}
                        </TableCell>
                      )}
                      {activeMapping.locationField && (
                        <TableCell className="text-cartographic-navy/70">
                          {formatCellValue(row[activeMapping.locationField])}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inline action button */}
      <div className="flex justify-end pt-4">
        <Button size="lg" onClick={nextStep} disabled={!canProceed} className="gap-2">
          {t("continueToReview")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
