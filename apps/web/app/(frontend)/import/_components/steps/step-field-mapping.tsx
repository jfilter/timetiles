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

import { Card, CardContent, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  CalendarIcon,
  CheckCircleIcon,
  FileSpreadsheetIcon,
  HashIcon,
  MapPinIcon,
  SparklesIcon,
  TableIcon,
  TextIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { type ConfidenceLevel, type FieldMapping, type SuggestedMappings, useWizard } from "../wizard-context";

/**
 * Check if a field mapping is complete (has all required fields)
 */
const isMappingComplete = (mapping: FieldMapping | undefined): boolean => {
  if (!mapping) return false;
  return (
    mapping.titleField !== null &&
    mapping.dateField !== null &&
    (mapping.locationField !== null || (mapping.latitudeField !== null && mapping.longitudeField !== null))
  );
};

/**
 * Confidence badge component showing auto-detection confidence level.
 */
const ConfidenceBadge = ({
  level,
  className,
}: Readonly<{
  level: ConfidenceLevel;
  className?: string;
}>) => {
  if (level === "none") return null;

  const styles = {
    high: "bg-cartographic-forest/10 text-cartographic-forest",
    medium: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    low: "bg-muted text-muted-foreground",
  };

  const labels = {
    high: "Auto-detected",
    medium: "Suggested",
    low: "Best guess",
  };

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

/**
 * Language detection banner showing the detected language.
 */
const LanguageDetectionBanner = ({
  suggestedMappings,
}: Readonly<{
  suggestedMappings: SuggestedMappings | undefined;
}>) => {
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
          Auto-detected: <span className="font-mono">{language.name}</span>
          {language.isReliable && (
            <span className="text-cartographic-navy/50 ml-2 font-mono text-xs">
              {Math.round(language.confidence * 100)}%
            </span>
          )}
        </p>
        <p className="text-cartographic-navy/70 text-xs">Fields mapped automatically from column names</p>
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

const ID_STRATEGIES = [
  { value: "auto", label: "Auto-generate", description: "Generate unique IDs automatically" },
  { value: "external", label: "Use source ID", description: "Use ID from your data" },
  { value: "computed", label: "Compute from fields", description: "Generate from selected fields" },
  { value: "hybrid", label: "Hybrid", description: "Use source ID if available, otherwise compute" },
] as const;

const DEDUP_STRATEGIES = [
  { value: "skip", label: "Skip duplicates", description: "Don't import events that already exist" },
  { value: "update", label: "Update existing", description: "Update existing events with new data" },
  { value: "version", label: "Create versions", description: "Keep both old and new versions" },
] as const;

interface FieldSelectProps {
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
}

const FieldSelect = ({
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
}: Readonly<FieldSelectProps>) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFieldChange(field, e.target.value === "" ? null : e.target.value);
    },
    [field, onFieldChange]
  );

  return (
    <div className="space-y-2" data-testid={`field-mapping-row-${field}`}>
      <Label htmlFor={id} className="text-cartographic-charcoal flex min-h-6 items-center gap-2">
        {icon && <span className="text-cartographic-navy/50">{icon}</span>}
        {label}
        {required && <span className="text-cartographic-terracotta">*</span>}
        {isAutoDetected && confidenceLevel && confidenceLevel !== "none" && <ConfidenceBadge level={confidenceLevel} />}
      </Label>
      <select
        id={id}
        value={value ?? ""}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "text-cartographic-charcoal flex h-11 w-full rounded-sm border bg-white px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2",
          "border-cartographic-navy/30 focus:border-cartographic-blue focus:ring-cartographic-blue/20",
          required && !value && "border-cartographic-terracotta/50",
          isAutoDetected && confidenceLevel === "high" && "border-cartographic-forest/40 border-dashed",
          disabled && "bg-cartographic-cream/50 cursor-not-allowed opacity-60"
        )}
      >
        <option value="">Select column...</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  );
};

interface SheetTabButtonProps {
  sheetIndex: number;
  displayName: string;
  rowCount: number;
  isComplete: boolean;
  isActive: boolean;
  onSelect: (index: number) => void;
}

const SheetTabButton = memo(
  ({ sheetIndex, displayName, rowCount, isComplete, isActive, onSelect }: Readonly<SheetTabButtonProps>) => {
    const handleClick = useCallback(() => {
      onSelect(sheetIndex);
    }, [onSelect, sheetIndex]);

    return (
      <button
        type="button"
        onClick={handleClick}
        data-testid={`sheet-tab-${sheetIndex}`}
        className={cn(
          "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors",
          isActive
            ? "border-cartographic-blue bg-cartographic-blue/10 text-cartographic-blue"
            : "border-cartographic-navy/20 hover:border-cartographic-navy/40 text-cartographic-charcoal",
          isComplete && !isActive && "border-cartographic-forest/40 bg-cartographic-forest/5"
        )}
      >
        {isComplete && <CheckCircleIcon className="text-cartographic-forest h-4 w-4" />}
        <span>{displayName}</span>
        <span className="text-cartographic-navy/50 font-mono text-xs">({rowCount})</span>
      </button>
    );
  }
);
SheetTabButton.displayName = "SheetTabButton";

interface IdStrategyCardProps {
  idStrategy: FieldMapping["idStrategy"];
  idField: string | null;
  headers: string[];
  deduplicationStrategy: string;
  onFieldChange: (field: keyof FieldMapping, value: string | null) => void;
  onDeduplicationChange: (value: string) => void;
}

const IdStrategyCard = ({
  idStrategy,
  idField,
  headers,
  deduplicationStrategy,
  onFieldChange,
  onDeduplicationChange,
}: Readonly<IdStrategyCardProps>) => {
  const handleStrategyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFieldChange("idStrategy", e.target.value);
    },
    [onFieldChange]
  );

  const handleIdFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFieldChange("idField", e.target.value === "" ? null : e.target.value);
    },
    [onFieldChange]
  );

  const handleDeduplicationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onDeduplicationChange(e.target.value);
    },
    [onDeduplicationChange]
  );

  const showIdField = idStrategy === "external" || idStrategy === "hybrid";

  return (
    <Card className="overflow-hidden">
      <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-cartographic-navy/10 flex h-10 w-10 items-center justify-center rounded-sm">
            <HashIcon className="text-cartographic-navy h-5 w-5" />
          </div>
          <div>
            <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Identity & Duplicates</h3>
            <p className="text-cartographic-navy/70 text-sm">How to identify and handle duplicate events</p>
          </div>
        </div>
      </div>
      <CardContent className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="id-strategy" className="text-cartographic-charcoal">
              ID generation
            </Label>
            <select
              id="id-strategy"
              value={idStrategy}
              onChange={handleStrategyChange}
              className="border-cartographic-navy/20 text-cartographic-charcoal focus:border-cartographic-blue focus:ring-cartographic-blue/20 flex h-11 w-full rounded-sm border bg-white px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
            >
              {ID_STRATEGIES.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dedup-strategy" className="text-cartographic-charcoal">
              Duplicate handling
            </Label>
            <select
              id="dedup-strategy"
              value={deduplicationStrategy}
              onChange={handleDeduplicationChange}
              className="border-cartographic-navy/20 text-cartographic-charcoal focus:border-cartographic-blue focus:ring-cartographic-blue/20 flex h-11 w-full rounded-sm border bg-white px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
            >
              {DEDUP_STRATEGIES.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showIdField && (
          <div className="space-y-2">
            <Label htmlFor="id-field" className="text-cartographic-charcoal">
              ID Field
            </Label>
            <select
              id="id-field"
              value={idField ?? ""}
              onChange={handleIdFieldChange}
              className="border-cartographic-navy/20 text-cartographic-charcoal focus:border-cartographic-blue focus:ring-cartographic-blue/20 flex h-11 w-full rounded-sm border bg-white px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
            >
              <option value="">Select column...</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const StepFieldMapping = ({ className }: Readonly<StepFieldMappingProps>) => {
  const { state, setFieldMapping, setImportOptions, nextStep, setNavigationConfig } = useWizard();
  const { sheets, fieldMappings, sheetMappings, deduplicationStrategy, geocodingEnabled } = state;

  // Configure navigation for this step
  useEffect(() => {
    setNavigationConfig({
      onNext: () => nextStep(),
    });
    return () => setNavigationConfig({});
  }, [setNavigationConfig, nextStep]);

  // State for active sheet tab (for multi-sheet files)
  const [activeSheetIndex, setActiveSheetIndex] = useState(sheets[0]?.index ?? 0);

  const activeSheet = sheets.find((s) => s.index === activeSheetIndex);
  const activeMapping = fieldMappings.find((m) => m.sheetIndex === activeSheetIndex);
  const suggestedMappings = activeSheet?.suggestedMappings;

  const headers = useMemo(() => activeSheet?.headers ?? [], [activeSheet]);

  // Helper to check if current value matches auto-detected suggestion
  const getFieldSuggestion = useCallback(
    (fieldName: keyof SuggestedMappings["mappings"]) => {
      const suggestion = suggestedMappings?.mappings[fieldName];
      return {
        suggestedPath: suggestion?.path ?? null,
        confidenceLevel: suggestion?.confidenceLevel ?? ("none" as ConfidenceLevel),
      };
    },
    [suggestedMappings]
  );

  const isAutoDetected = useCallback(
    (fieldName: keyof SuggestedMappings["mappings"], currentValue: string | null) => {
      const { suggestedPath } = getFieldSuggestion(fieldName);
      return currentValue !== null && currentValue === suggestedPath;
    },
    [getFieldSuggestion]
  );

  const handleFieldChange = useCallback(
    (field: keyof FieldMapping, value: string | null) => {
      setFieldMapping(activeSheetIndex, { [field]: value === "" ? null : value });
    },
    [activeSheetIndex, setFieldMapping]
  );

  const handleDeduplicationChange = useCallback(
    (value: string) => {
      setImportOptions({ deduplicationStrategy: value as typeof deduplicationStrategy });
    },
    [setImportOptions]
  );

  const handleGeocodingChange = useCallback(
    (enabled: boolean) => {
      setImportOptions({ geocodingEnabled: enabled });
    },
    [setImportOptions]
  );

  // Wrapper callback for checkbox to avoid inline function in JSX
  const handleGeocodingCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleGeocodingChange(e.target.checked);
    },
    [handleGeocodingChange]
  );

  if (!activeSheet || !activeMapping) {
    return (
      <div className={cn("py-12 text-center", className)}>
        <p className="text-muted-foreground">No data available. Please go back and upload a file.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Map your fields</h2>
        <p className="text-cartographic-navy/70 mt-2">Tell us which columns contain your event data.</p>
      </div>

      {/* Language detection banner */}
      <LanguageDetectionBanner suggestedMappings={suggestedMappings} />

      {/* Sheet tabs for multi-sheet files */}
      {sheets.length > 1 && (
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 rounded-sm border p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheetIcon className="text-cartographic-navy/50 h-5 w-5" />
            <p className="text-cartographic-navy/70 text-sm">
              {sheets.length} sheets detected. Configure mapping for each sheet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="sheet-tabs">
            {sheets.map((sheet) => {
              const mapping = fieldMappings.find((m) => m.sheetIndex === sheet.index);
              const isComplete = isMappingComplete(mapping);
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
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Required fields</h3>
              <p className="text-cartographic-navy/70 text-sm">These fields are required for all events</p>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <FieldSelect
            id="title-field"
            label="Title"
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
            label="Date"
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
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Location</h3>
              <p className="text-cartographic-navy/70 text-sm">Address or coordinates</p>
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 p-6">
          <FieldSelect
            id="location-field"
            label="Address / Location"
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
              <span className="text-cartographic-navy/50 bg-white px-3">Or use coordinates</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              id="latitude-field"
              label="Latitude"
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
              label="Longitude"
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
            <p className="text-cartographic-terracotta text-sm">
              Please select either a location field or both latitude and longitude.
            </p>
          )}

          {/* Geocoding option - only show when using address field */}
          {activeMapping.locationField && (
            <div className="border-cartographic-blue/20 bg-cartographic-blue/5 flex items-start gap-3 rounded-sm border p-4">
              <input
                id="geocoding-enabled"
                type="checkbox"
                checked={geocodingEnabled}
                onChange={handleGeocodingCheckboxChange}
                className="border-cartographic-navy/30 text-cartographic-blue focus:ring-cartographic-blue/20 mt-0.5 h-4 w-4 rounded"
              />
              <div>
                <Label htmlFor="geocoding-enabled" className="text-cartographic-charcoal">
                  Enable geocoding
                </Label>
                <p className="text-cartographic-navy/70 text-sm">Convert addresses to coordinates for map display.</p>
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
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Optional fields</h3>
              <p className="text-cartographic-navy/70 text-sm">Additional fields to enrich your events</p>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <FieldSelect
            id="description-field"
            label="Description"
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
            label="Location Name"
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
                <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Preview</h3>
                <p className="text-cartographic-navy/70 text-sm">Sample of your data with the current mapping</p>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-cartographic-navy/10 bg-cartographic-cream/20 border-b">
                    {activeMapping.titleField && (
                      <th className="text-cartographic-charcoal px-4 py-3 text-left font-medium">Title</th>
                    )}
                    {activeMapping.dateField && (
                      <th className="text-cartographic-charcoal px-4 py-3 text-left font-medium">Date</th>
                    )}
                    {activeMapping.locationField && (
                      <th className="text-cartographic-charcoal px-4 py-3 text-left font-medium">Location</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.sampleData.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-cartographic-navy/5 border-b last:border-0">
                      {activeMapping.titleField && (
                        <td className="text-cartographic-charcoal px-4 py-3">
                          {formatCellValue(row[activeMapping.titleField])}
                        </td>
                      )}
                      {activeMapping.dateField && (
                        <td className="text-cartographic-navy/70 px-4 py-3 font-mono">
                          {formatCellValue(row[activeMapping.dateField])}
                        </td>
                      )}
                      {activeMapping.locationField && (
                        <td className="text-cartographic-navy/70 px-4 py-3">
                          {formatCellValue(row[activeMapping.locationField])}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
