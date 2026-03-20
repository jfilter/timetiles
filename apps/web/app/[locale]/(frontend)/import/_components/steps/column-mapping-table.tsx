/**
 * Column-centric mapping table for the import wizard.
 *
 * Renders every source CSV/Excel column as a row with:
 * source column + sample value -> transform chain -> target field assignment.
 *
 * @module
 * @category Components
 */
"use client";

import { Checkbox, Label, Table, TableBody, TableHead, TableHeader, TableRow } from "@timetiles/ui";
import { Button } from "@timetiles/ui/components/button";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import type { ConcatenateTransform, TransformType } from "@/lib/types/import-transforms";
import { createTransform } from "@/lib/types/import-transforms";
import type {
  ConfidenceLevel,
  FieldMapping,
  FieldMappingStringField,
  ImportTransform,
  SuggestedMappings,
} from "@/lib/types/import-wizard";

import { TargetSelect } from "./column-mapping-shared";
import { ColumnRow } from "./column-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnMappingTableProps {
  headers: string[];
  sampleData: Record<string, unknown>[];
  fieldMapping: FieldMapping;
  transforms: ImportTransform[];
  suggestedMappings?: SuggestedMappings;
  geocodingEnabled: boolean;
  onFieldMappingChange: (field: keyof FieldMapping, value: string | null) => void;
  onTransformsChange: (transforms: ImportTransform[]) => void;
  onGeocodingChange: (enabled: boolean) => void;
}

export interface ColumnViewRow {
  columnName: string;
  sampleValue: unknown;
  targetField: FieldMappingStringField | null;
  transforms: ImportTransform[];
  isAutoDetected: boolean;
  confidenceLevel: ConfidenceLevel;
  isSplitParent: boolean;
  splitChildren?: string[];
}

// ---------------------------------------------------------------------------
// Mapping between FieldMapping keys and SuggestedMappings keys
// ---------------------------------------------------------------------------

const FIELD_TO_SUGGESTION_KEY: Partial<Record<FieldMappingStringField, keyof SuggestedMappings["mappings"]>> = {
  titleField: "titlePath",
  dateField: "timestampPath",
  descriptionField: "descriptionPath",
  locationNameField: "locationNamePath",
  locationField: "locationPath",
  latitudeField: "latitudePath",
  longitudeField: "longitudePath",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All FieldMapping keys that hold `string | null` column names. */
const FIELD_MAPPING_STRING_KEYS: FieldMappingStringField[] = [
  "titleField",
  "dateField",
  "descriptionField",
  "locationNameField",
  "locationField",
  "latitudeField",
  "longitudeField",
  "idField",
];

/** Find which target field a source column is currently assigned to. */
const findTargetForColumn = (columnName: string, fieldMapping: FieldMapping): FieldMappingStringField | null => {
  for (const key of FIELD_MAPPING_STRING_KEYS) {
    if (fieldMapping[key] === columnName) return key;
  }
  return null;
};

/** Get the first non-null sample value for a column. */
const getSampleValue = (columnName: string, sampleData: Record<string, unknown>[]): unknown => {
  for (const row of sampleData) {
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== "") return val;
  }
  return sampleData[0]?.[columnName] ?? null;
};

/** Build the column-centric view from field mapping + transforms. */
const buildColumnView = (
  headers: string[],
  sampleData: Record<string, unknown>[],
  fieldMapping: FieldMapping,
  transforms: ImportTransform[],
  suggestedMappings?: SuggestedMappings
): ColumnViewRow[] =>
  headers.map((columnName) => {
    const targetField = findTargetForColumn(columnName, fieldMapping);

    // Find transforms that reference this column
    const columnTransforms = transforms.filter((t) => {
      if ("from" in t) return t.from === columnName;
      if ("fromFields" in t) return (t as { fromFields: string[] }).fromFields.includes(columnName);
      return false;
    });

    // Check auto-detection
    let isAutoDetected = false;
    let confidenceLevel: ConfidenceLevel = "none";

    if (targetField && suggestedMappings) {
      const suggestionKey = FIELD_TO_SUGGESTION_KEY[targetField];
      if (suggestionKey) {
        const suggestion = suggestedMappings.mappings[suggestionKey];
        if (suggestion?.path === columnName) {
          isAutoDetected = true;
          confidenceLevel = suggestion.confidenceLevel;
        }
      }
    }

    // Check for split transforms
    const splitTransform = columnTransforms.find((t) => t.type === "split");
    const isSplitParent = Boolean(splitTransform);
    const splitChildren = splitTransform?.type === "split" ? splitTransform.toFields : undefined;

    return {
      columnName,
      sampleValue: getSampleValue(columnName, sampleData),
      targetField,
      transforms: columnTransforms,
      isAutoDetected,
      confidenceLevel,
      isSplitParent,
      splitChildren,
    };
  });

// ---------------------------------------------------------------------------
// CombinedRow (for concatenate transforms that produce virtual columns)
// ---------------------------------------------------------------------------

interface CombinedRowProps {
  transform: ConcatenateTransform;
  assignedTargets: Set<string>;
  fieldMapping: FieldMapping;
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
  onRemove: (transformId: string) => void;
}

const CombinedRow = ({
  transform,
  assignedTargets,
  fieldMapping,
  onTargetChange,
  onRemove,
}: Readonly<CombinedRowProps>) => {
  const t = useTranslations("Import");

  const targetField = transform.to ? findTargetForColumn(transform.to, fieldMapping) : null;

  return (
    <tr className="border-cartographic-navy/5 border-b bg-amber-50/30 last:border-0 dark:bg-amber-950/10">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="text-cartographic-navy h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <span className="text-cartographic-charcoal font-mono text-sm font-medium">
              {transform.to || t("combineColumns")}
            </span>
            <p className="text-cartographic-navy/50 truncate text-xs">
              {transform.fromFields.join(` ${transform.separator} `)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-muted-foreground text-xs italic">{t("combineColumns")}</span>
      </td>
      <td className="px-4 py-3">
        <TargetSelect
          columnName={transform.to}
          targetField={targetField}
          assignedTargets={assignedTargets}
          onTargetChange={onTargetChange}
        />
      </td>
      <td className="px-4 py-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
          onClick={() => onRemove(transform.id)}
          aria-label={t("removeTransform")}
        >
          <span aria-hidden="true">&times;</span>
        </Button>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// ColumnMappingTable
// ---------------------------------------------------------------------------

export const ColumnMappingTable = ({
  headers,
  sampleData,
  fieldMapping,
  transforms,
  suggestedMappings,
  geocodingEnabled,
  onFieldMappingChange,
  onTransformsChange,
  onGeocodingChange,
}: Readonly<ColumnMappingTableProps>) => {
  const t = useTranslations("Import");

  // Build derived column view
  const columnRows = useMemo(
    () => buildColumnView(headers, sampleData, fieldMapping, transforms, suggestedMappings),
    [headers, sampleData, fieldMapping, transforms, suggestedMappings]
  );

  // Collect assigned targets
  const assignedTargets = useMemo(() => {
    const set = new Set<string>();
    for (const key of FIELD_MAPPING_STRING_KEYS) {
      if (fieldMapping[key]) set.add(key);
    }
    return set;
  }, [fieldMapping]);

  // Concatenate transforms that produce virtual rows
  const concatTransforms = useMemo(
    () => transforms.filter((t): t is ConcatenateTransform => t.type === "concatenate"),
    [transforms]
  );

  // --- Handlers ---

  const handleTargetChange = useCallback(
    (columnName: string, newTarget: FieldMappingStringField | null) => {
      // Find current target for this column
      const currentTarget = findTargetForColumn(columnName, fieldMapping);

      // Clear old assignment
      if (currentTarget) {
        onFieldMappingChange(currentTarget, null);
      }

      // Set new assignment
      if (newTarget) {
        // If the new target is already assigned to another column, clear it
        if (fieldMapping[newTarget]) {
          onFieldMappingChange(newTarget, null);
        }
        onFieldMappingChange(newTarget, columnName);
      }
    },
    [fieldMapping, onFieldMappingChange]
  );

  const handleTransformAdd = useCallback(
    (columnName: string, type: TransformType) => {
      const newTransform = createTransform(type);

      // Pre-fill the `from` field with the column name
      if ("from" in newTransform) {
        (newTransform as ImportTransform & { from: string }).from = columnName;
      }

      onTransformsChange([...transforms, newTransform]);
    },
    [transforms, onTransformsChange]
  );

  const handleTransformRemove = useCallback(
    (_columnName: string, transformId: string) => {
      onTransformsChange(transforms.filter((t) => t.id !== transformId));
    },
    [transforms, onTransformsChange]
  );

  const handleTransformUpdate = useCallback(
    (_columnName: string, transformId: string, updates: Partial<ImportTransform>) => {
      onTransformsChange(transforms.map((t) => (t.id === transformId ? ({ ...t, ...updates } as ImportTransform) : t)));
    },
    [transforms, onTransformsChange]
  );

  const handleAddConcatenate = useCallback(() => {
    const newTransform = createTransform("concatenate");
    onTransformsChange([...transforms, newTransform]);
  }, [transforms, onTransformsChange]);

  const handleRemoveConcatenate = useCallback(
    (transformId: string) => {
      onTransformsChange(transforms.filter((t) => t.id !== transformId));
    },
    [transforms, onTransformsChange]
  );

  const handleGeocodingCheckedChange = useCallback(
    (checked: boolean | "indeterminate") => {
      onGeocodingChange(checked === true);
    },
    [onGeocodingChange]
  );

  // Show geocoding option when locationField is assigned
  const showGeocoding = Boolean(fieldMapping.locationField);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow className="border-cartographic-navy/10 bg-cartographic-cream/20">
              <TableHead className="text-cartographic-charcoal w-[30%] font-medium">{t("sourceColumn")}</TableHead>
              <TableHead className="text-cartographic-charcoal w-[35%] font-medium">{t("flowTransforms")}</TableHead>
              <TableHead className="text-cartographic-charcoal w-[25%] font-medium">{t("flowTargetField")}</TableHead>
              <TableHead className="w-[10%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {columnRows.map((row) => (
              <ColumnRow
                key={row.columnName}
                columnName={row.columnName}
                sampleValue={row.sampleValue}
                targetField={row.targetField}
                transforms={row.transforms}
                isAutoDetected={row.isAutoDetected}
                confidenceLevel={row.confidenceLevel}
                assignedTargets={assignedTargets}
                onTargetChange={handleTargetChange}
                onTransformAdd={handleTransformAdd}
                onTransformRemove={handleTransformRemove}
                onTransformUpdate={handleTransformUpdate}
                sourceColumns={headers}
              />
            ))}

            {/* Concatenate virtual rows */}
            {concatTransforms.map((ct) => (
              <CombinedRow
                key={ct.id}
                transform={ct}
                assignedTargets={assignedTargets}
                fieldMapping={fieldMapping}
                onTargetChange={handleTargetChange}
                onRemove={handleRemoveConcatenate}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add combine columns button */}
      <Button variant="outline" size="sm" onClick={handleAddConcatenate} className="gap-2">
        <Plus className="h-4 w-4" />
        {t("combineColumns")}
      </Button>

      {/* Geocoding checkbox */}
      {showGeocoding && (
        <div className="border-cartographic-blue/20 bg-cartographic-blue/5 flex items-start gap-3 rounded-sm border p-4">
          <Checkbox
            id="geocoding-enabled-table"
            checked={geocodingEnabled}
            onCheckedChange={handleGeocodingCheckedChange}
            className="mt-0.5"
          />
          <div>
            <Label htmlFor="geocoding-enabled-table" className="text-cartographic-charcoal">
              {t("enableGeocoding")}
            </Label>
            <p className="text-cartographic-navy/70 text-sm">{t("enableGeocodingDescription")}</p>
          </div>
        </div>
      )}
    </div>
  );
};
