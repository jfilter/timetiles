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

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { CalendarIcon, HashIcon, MapPinIcon, TextIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { type FieldMapping, useWizard } from "../wizard-context";
import { WizardNavigation } from "../wizard-navigation";

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
}: Readonly<FieldSelectProps>) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFieldChange(field, e.target.value === "" ? null : e.target.value);
    },
    [field, onFieldChange]
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <select
        id={id}
        value={value ?? ""}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "border-input bg-background flex h-11 w-full rounded-sm border px-4 py-2 text-sm",
          required && !value && "border-destructive/50"
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

interface IdStrategyCardProps {
  idStrategy: FieldMapping["idStrategy"];
  idField: string | null;
  headers: string[];
  onFieldChange: (field: keyof FieldMapping, value: string | null) => void;
}

const IdStrategyCard = ({ idStrategy, idField, headers, onFieldChange }: Readonly<IdStrategyCardProps>) => {
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

  const showIdField = idStrategy === "external" || idStrategy === "hybrid";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HashIcon className="h-5 w-5" />
          ID Strategy
        </CardTitle>
        <CardDescription>How should unique identifiers be generated for your events?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="id-strategy">Strategy</Label>
          <select
            id="id-strategy"
            value={idStrategy}
            onChange={handleStrategyChange}
            className="border-input bg-background flex h-11 w-full rounded-sm border px-4 py-2 text-sm"
          >
            {ID_STRATEGIES.map((strategy) => (
              <option key={strategy.value} value={strategy.value}>
                {strategy.label} - {strategy.description}
              </option>
            ))}
          </select>
        </div>

        {showIdField && (
          <div className="space-y-2">
            <Label htmlFor="id-field">ID Field</Label>
            <select
              id="id-field"
              value={idField ?? ""}
              onChange={handleIdFieldChange}
              className="border-input bg-background flex h-11 w-full rounded-sm border px-4 py-2 text-sm"
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
  const { state, setFieldMapping, nextStep } = useWizard();
  const { sheets, fieldMappings, sheetMappings } = state;

  // Get active sheet index (first sheet for now, could be tabbed later)
  const activeSheetIndex = sheets[0]?.index ?? 0;
  const activeSheet = sheets.find((s) => s.index === activeSheetIndex);
  const activeMapping = fieldMappings.find((m) => m.sheetIndex === activeSheetIndex);
  const activeSheetMapping = sheetMappings.find((m) => m.sheetIndex === activeSheetIndex);

  const headers = useMemo(() => activeSheet?.headers ?? [], [activeSheet]);

  const handleFieldChange = useCallback(
    (field: keyof FieldMapping, value: string | null) => {
      setFieldMapping(activeSheetIndex, { [field]: value === "" ? null : value });
    },
    [activeSheetIndex, setFieldMapping]
  );

  const handleNext = useCallback(() => {
    nextStep();
  }, [nextStep]);

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
        <h2 className="text-2xl font-semibold">Map your fields</h2>
        <p className="text-muted-foreground mt-2">Tell us which columns contain your event data.</p>
      </div>

      {/* Sheet indicator for multi-sheet files */}
      {sheets.length > 1 && (
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm font-medium">
            Mapping: {activeSheet.name}
            {activeSheetMapping?.newDatasetName && (
              <span className="text-muted-foreground"> → {activeSheetMapping.newDatasetName}</span>
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {sheets.length} sheets detected. Configure mapping for each sheet.
          </p>
        </div>
      )}

      {/* Required fields */}
      <Card>
        <CardHeader>
          <CardTitle>Required fields</CardTitle>
          <CardDescription>These fields are required for all events.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldSelect
            id="title-field"
            label="Title"
            field="titleField"
            required
            icon={<TextIcon className="h-4 w-4" />}
            value={activeMapping.titleField}
            headers={headers}
            onFieldChange={handleFieldChange}
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
          />
        </CardContent>
      </Card>

      {/* Location fields */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinIcon className="h-5 w-5" />
            Location
          </CardTitle>
          <CardDescription>
            Provide either an address/location field OR latitude and longitude coordinates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldSelect
            id="location-field"
            label="Address / Location"
            field="locationField"
            required={false}
            icon={null}
            value={activeMapping.locationField}
            headers={headers}
            onFieldChange={handleFieldChange}
          />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">Or use coordinates</span>
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
            />
          </div>

          {!activeMapping.locationField && !activeMapping.latitudeField && !activeMapping.longitudeField && (
            <p className="text-destructive text-sm">
              Please select either a location field or both latitude and longitude.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Optional fields */}
      <Card>
        <CardHeader>
          <CardTitle>Optional fields</CardTitle>
          <CardDescription>Additional fields to enrich your events.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldSelect
            id="description-field"
            label="Description"
            field="descriptionField"
            required={false}
            icon={<TextIcon className="h-4 w-4" />}
            value={activeMapping.descriptionField}
            headers={headers}
            onFieldChange={handleFieldChange}
          />
          <FieldSelect
            id="end-date-field"
            label="End Date"
            field="endDateField"
            required={false}
            icon={<CalendarIcon className="h-4 w-4" />}
            value={activeMapping.endDateField}
            headers={headers}
            onFieldChange={handleFieldChange}
          />
        </CardContent>
      </Card>

      {/* ID Strategy */}
      <IdStrategyCard
        idStrategy={activeMapping.idStrategy}
        idField={activeMapping.idField}
        headers={headers}
        onFieldChange={handleFieldChange}
      />

      {/* Data preview - placeholder for later */}
      {activeSheet.sampleData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Sample of your data with the current mapping.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {activeMapping.titleField && <th className="px-4 py-2 text-left font-medium">Title</th>}
                    {activeMapping.dateField && <th className="px-4 py-2 text-left font-medium">Date</th>}
                    {activeMapping.locationField && <th className="px-4 py-2 text-left font-medium">Location</th>}
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.sampleData.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {activeMapping.titleField && (
                        <td className="px-4 py-2">{formatCellValue(row[activeMapping.titleField])}</td>
                      )}
                      {activeMapping.dateField && (
                        <td className="px-4 py-2">{formatCellValue(row[activeMapping.dateField])}</td>
                      )}
                      {activeMapping.locationField && (
                        <td className="px-4 py-2">{formatCellValue(row[activeMapping.locationField])}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <WizardNavigation onNext={handleNext} />
    </div>
  );
};
