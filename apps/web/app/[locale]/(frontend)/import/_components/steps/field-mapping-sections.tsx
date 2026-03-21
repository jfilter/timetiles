/**
 * Sub-components for the field mapping step.
 *
 * Extracted to keep step-field-mapping.tsx under the file-size limit
 * while maintaining a clean component hierarchy.
 *
 * @module
 * @category Components
 */
"use client";

import { Checkbox, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@timetiles/ui";
import { Button } from "@timetiles/ui/components/button";
import { cn } from "@timetiles/ui/lib/utils";
import { CheckCircleIcon, MapPinIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type {
  ConfidenceLevel,
  ConfigSuggestion,
  FieldMapping,
  SheetInfo,
  SuggestedMappings,
} from "@/lib/types/import-wizard";

import { FieldSelect } from "./field-select";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type LocationMode = "address" | "coordinates";

export interface FieldSuggestionResult {
  suggestedPath: string | null;
  confidenceLevel: ConfidenceLevel;
}

export interface PreviewField {
  label: string;
  columnKey: string;
  mono?: boolean;
}

// ---------------------------------------------------------------------------
// LanguageDetectionBanner
// ---------------------------------------------------------------------------

export const LanguageDetectionBanner = ({
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

// ---------------------------------------------------------------------------
// LocationSection
// ---------------------------------------------------------------------------

interface LocationSectionProps {
  locationMode: LocationMode;
  onLocationModeChange: (mode: LocationMode) => void;
  activeMapping: FieldMapping;
  headers: string[];
  geocodingEnabled: boolean;
  onFieldChange: (field: keyof FieldMapping, value: string | null) => void;
  onGeocodingCheckedChange: (checked: boolean | "indeterminate") => void;
  getFieldSuggestion: (fieldName: keyof SuggestedMappings["mappings"]) => FieldSuggestionResult;
  isAutoDetected: (fieldName: keyof SuggestedMappings["mappings"], value: string | null) => boolean;
}

export const LocationSection = ({
  locationMode,
  onLocationModeChange,
  activeMapping,
  headers,
  geocodingEnabled,
  onFieldChange,
  onGeocodingCheckedChange,
  getFieldSuggestion,
  isAutoDetected,
}: Readonly<LocationSectionProps>) => {
  const t = useTranslations("Import");

  return (
    <div className="border-cartographic-terracotta/30 border-l-4 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("location")}</h3>
          <p className="text-cartographic-navy/70 text-sm">{t("locationDescription")}</p>
        </div>
        <div className="border-cartographic-navy/10 inline-flex rounded-sm border" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={locationMode === "address"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
              locationMode === "address"
                ? "bg-cartographic-charcoal text-white"
                : "text-cartographic-navy/70 hover:bg-cartographic-cream/50"
            )}
            onClick={() => onLocationModeChange("address")}
          >
            <MapPinIcon className="h-3.5 w-3.5" />
            {t("locationTypeAddress")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={locationMode === "coordinates"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
              locationMode === "coordinates"
                ? "bg-cartographic-charcoal text-white"
                : "text-cartographic-navy/70 hover:bg-cartographic-cream/50"
            )}
            onClick={() => onLocationModeChange("coordinates")}
          >
            {t("locationTypeCoordinates")}
          </button>
        </div>
      </div>

      {locationMode === "address" ? (
        <div className="space-y-4">
          <FieldSelect
            id="location-field"
            label={t("addressLocation")}
            field="locationField"
            required={false}
            icon={null}
            value={activeMapping.locationField}
            headers={headers}
            onFieldChange={onFieldChange}
            confidenceLevel={getFieldSuggestion("locationPath").confidenceLevel}
            isAutoDetected={isAutoDetected("locationPath", activeMapping.locationField)}
            validationMessage={!activeMapping.locationField ? t("fieldRequired") : undefined}
          />

          {activeMapping.locationField && (
            <div className="border-cartographic-blue/20 bg-cartographic-blue/5 flex items-start gap-3 rounded-sm border p-4">
              <Checkbox
                id="geocoding-enabled"
                checked={geocodingEnabled}
                onCheckedChange={onGeocodingCheckedChange}
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
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSelect
            id="latitude-field"
            label={t("latitude")}
            field="latitudeField"
            required={false}
            icon={null}
            value={activeMapping.latitudeField}
            headers={headers}
            onFieldChange={onFieldChange}
            confidenceLevel={getFieldSuggestion("latitudePath").confidenceLevel}
            isAutoDetected={isAutoDetected("latitudePath", activeMapping.latitudeField)}
            validationMessage={!activeMapping.latitudeField ? t("fieldRequired") : undefined}
          />
          <FieldSelect
            id="longitude-field"
            label={t("longitude")}
            field="longitudeField"
            required={false}
            icon={null}
            value={activeMapping.longitudeField}
            headers={headers}
            onFieldChange={onFieldChange}
            confidenceLevel={getFieldSuggestion("longitudePath").confidenceLevel}
            isAutoDetected={isAutoDetected("longitudePath", activeMapping.longitudeField)}
            validationMessage={!activeMapping.longitudeField ? t("fieldRequired") : undefined}
          />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DataPreviewSection
// ---------------------------------------------------------------------------

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
};

interface DataPreviewSectionProps {
  fields: PreviewField[];
  sampleData: SheetInfo["sampleData"];
}

export const DataPreviewSection = ({ fields, sampleData }: Readonly<DataPreviewSectionProps>) => {
  const t = useTranslations("Import");

  return (
    <div className="p-6">
      <h3 className="text-cartographic-charcoal mb-3 font-serif text-lg font-semibold">{t("preview")}</h3>
      {fields.length === 0 ? (
        <p className="text-cartographic-navy/50 text-sm">{t("noPreviewYet")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-cartographic-navy/10 bg-cartographic-cream/20">
                {fields.map((f) => (
                  <TableHead key={`${f.label}-${f.columnKey}`} className="text-cartographic-charcoal font-medium">
                    {f.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleData.slice(0, 3).map((row, i) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- sample data rows have no unique ID
                <TableRow key={`preview-row-${i}`} className="border-cartographic-navy/5 last:border-0">
                  {fields.map((f) => (
                    <TableCell
                      key={`${f.label}-${f.columnKey}`}
                      className={cn(f.mono ? "text-cartographic-navy/70 font-mono" : "text-cartographic-charcoal")}
                    >
                      {formatCellValue(row[f.columnKey])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CompletionStatusBar
// ---------------------------------------------------------------------------

interface CompletionStatusBarProps {
  isComplete: boolean;
  remainingCount: number;
  missingFields?: string[];
}

export const CompletionStatusBar = ({
  isComplete,
  remainingCount,
  missingFields,
}: Readonly<CompletionStatusBarProps>) => {
  const t = useTranslations("Import");

  return (
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
        <>
          {t("requiredFieldsRemaining", { count: remainingCount })}
          {missingFields && missingFields.length > 0 && (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic keys
            <span className="text-cartographic-terracotta/70">
              ({missingFields.map((f) => t(f as any)).join(", ")})
            </span>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ConfigSuggestionBanner
// ---------------------------------------------------------------------------

interface ConfigSuggestionBannerProps {
  suggestion: ConfigSuggestion;
  isApplied: boolean;
  onApply: () => void;
  onReset: () => void;
  onIgnore: () => void;
}

export const ConfigSuggestionBanner = ({
  suggestion,
  isApplied,
  onApply,
  onReset,
  onIgnore,
}: Readonly<ConfigSuggestionBannerProps>) => {
  const t = useTranslations("Import");

  if (isApplied) {
    return (
      <div
        className="border-cartographic-forest/20 bg-cartographic-forest/5 flex items-center justify-between rounded-sm border px-4 py-3"
        data-testid="config-suggestion-applied"
      >
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="text-cartographic-forest h-4 w-4" />
          <span className="text-cartographic-forest text-sm">
            {t("configLoadedFromDataset", { name: suggestion.datasetName })}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          {t("resetToAutoDetected")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="border-cartographic-blue/20 bg-cartographic-blue/5 flex items-center justify-between rounded-sm border px-4 py-3"
      data-testid="config-suggestion-banner"
    >
      <span className="text-cartographic-blue text-sm">
        {t("similarConfig", { name: suggestion.datasetName, score: suggestion.score })}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onIgnore}>
          {t("ignoreSuggestion")}
        </Button>
        <Button size="sm" onClick={onApply}>
          {t("useThisConfig")}
        </Button>
      </div>
    </div>
  );
};
