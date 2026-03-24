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

import { ConfirmDialog, Label, Table, TableBody, TableHead, TableHeader, TableRow } from "@timetiles/ui";
import { Button } from "@timetiles/ui/components/button";
import { Input } from "@timetiles/ui/components/input";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import type { ConcatenateTransform, TransformType } from "@/lib/types/ingest-transforms";
import { createTransform } from "@/lib/types/ingest-transforms";
import type {
  ConfidenceLevel,
  FieldMapping,
  FieldMappingStringField,
  IngestTransform,
  SuggestedMappings,
} from "@/lib/types/ingest-wizard";

import { TargetSelect } from "./column-mapping-shared";
import { ColumnRow } from "./column-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnMappingTableProps {
  headers: string[];
  sampleData: Record<string, unknown>[];
  fieldMapping: FieldMapping;
  transforms: IngestTransform[];
  suggestedMappings?: SuggestedMappings;
  geocodingEnabled: boolean;
  onFieldMappingChange: (field: keyof FieldMapping, value: string | null) => void;
  onTransformsChange: (transforms: IngestTransform[]) => void;
  onGeocodingChange: (enabled: boolean) => void;
}

export interface ColumnViewRow {
  columnName: string;
  sampleValue: unknown;
  targetField: FieldMappingStringField | null;
  transforms: IngestTransform[];
  isAutoDetected: boolean;
  confidenceLevel: ConfidenceLevel;
  isSplitParent: boolean;
  splitChildren?: string[];
  splitChildTransforms?: Record<string, IngestTransform[]>;
  splitChildTargets?: Record<string, FieldMappingStringField | null>;
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
export const findTargetForColumn = (columnName: string, fieldMapping: FieldMapping): FieldMappingStringField | null => {
  if (!columnName) return null;
  for (const key of FIELD_MAPPING_STRING_KEYS) {
    if (fieldMapping[key] === columnName) return key;
  }
  return null;
};

/** Get the first non-null sample value for a column. */
export const getSampleValue = (columnName: string, sampleData: Record<string, unknown>[]): unknown => {
  for (const row of sampleData) {
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== "") return val;
  }
  return sampleData[0]?.[columnName] ?? null;
};

/** Build the column-centric view from field mapping + transforms. */
export const buildColumnView = (
  headers: string[],
  sampleData: Record<string, unknown>[],
  fieldMapping: FieldMapping,
  transforms: IngestTransform[],
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

    // Compute transforms and targets for each split child field
    const splitChildTransforms =
      splitTransform?.type === "split"
        ? Object.fromEntries(
            splitTransform.toFields.map((childName) => [
              childName,
              transforms.filter((t) => "from" in t && t.from === childName && t.type !== "split"),
            ])
          )
        : undefined;

    const splitChildTargets =
      splitTransform?.type === "split"
        ? Object.fromEntries(
            splitTransform.toFields.map((childName) => [childName, findTargetForColumn(childName, fieldMapping)])
          )
        : undefined;

    return {
      columnName,
      sampleValue: getSampleValue(columnName, sampleData),
      targetField,
      transforms: columnTransforms,
      isAutoDetected,
      confidenceLevel,
      isSplitParent,
      splitChildren,
      splitChildTransforms,
      splitChildTargets,
    };
  });

// ---------------------------------------------------------------------------
// CombinedRow (for concatenate transforms that produce virtual columns)
// ---------------------------------------------------------------------------

interface CombinedRowProps {
  transform: ConcatenateTransform;
  assignedTargets: Set<string>;
  fieldMapping: FieldMapping;
  sourceColumns: string[];
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
  onUpdate: (transformId: string, updates: Partial<IngestTransform>) => void;
  onRemove: (transformId: string) => void;
  autoExpand?: boolean;
}

const CombinedRow = ({
  transform,
  assignedTargets,
  fieldMapping,
  sourceColumns,
  onTargetChange,
  onUpdate,
  onRemove,
  autoExpand = false,
}: Readonly<CombinedRowProps>) => {
  const t = useTranslations("Ingest");
  const [expanded, setExpanded] = useState(autoExpand || transform.fromFields.length === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const targetField = transform.to ? findTargetForColumn(transform.to, fieldMapping) : null;
  const summary =
    transform.fromFields.length > 0 ? transform.fromFields.join(` ${transform.separator} `) : t("combineColumns");

  const handleChange = useCallback(
    (updates: Partial<IngestTransform>) => onUpdate(transform.id, updates),
    [transform.id, onUpdate]
  );

  const handleFieldToggle = useCallback(
    (column: string) => {
      const current = transform.fromFields;
      const updated = current.includes(column) ? current.filter((f) => f !== column) : [...current, column];
      handleChange({ fromFields: updated });
    },
    [transform.fromFields, handleChange]
  );

  return (
    <>
      <tr className="border-primary/5 border-b bg-amber-50/30 last:border-0 dark:bg-amber-950/10">
        <td className="px-4 py-3">
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => setExpanded(!expanded)}>
            <ArrowLeftRight className="text-primary h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <span className="text-foreground font-mono text-sm font-medium">
                {transform.to || t("combineColumns")}
              </span>
              <p className="text-muted-foreground truncate text-xs">{summary}</p>
            </div>
          </button>
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
            onClick={() => setConfirmDelete(true)}
            aria-label={t("removeTransform")}
          >
            <span aria-hidden="true">&times;</span>
          </Button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-primary/5 border-b bg-amber-50/20 last:border-0">
          <td colSpan={4} className="px-6 py-4">
            <div className="max-w-2xl space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground text-sm">
                  {t("sourceColumn")} {t("tfSelectMultiple")}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {sourceColumns.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => handleFieldToggle(col)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-sm transition-colors",
                        transform.fromFields.includes(col)
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted-foreground hover:border-accent/50"
                      )}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`separator-${transform.id}`}>{t("tfSeparator")}</Label>
                  <Input
                    id={`separator-${transform.id}`}
                    value={transform.separator}
                    onChange={(e) => handleChange({ separator: e.target.value })}
                    placeholder={t("tfSeparatorPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`to-${transform.id}`}>{t("tfTargetFieldName")}</Label>
                  <Input
                    id={`to-${transform.id}`}
                    value={transform.to}
                    onChange={(e) => handleChange({ to: e.target.value })}
                    placeholder={t("tfTargetFieldPlaceholder")}
                  />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirmDeleteTransform")}
        description={t("confirmDeleteTransformDescription")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancelEdit")}
        variant="destructive"
        onConfirm={() => onRemove(transform.id)}
      />
    </>
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
  const t = useTranslations("Ingest");

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
        (newTransform as IngestTransform & { from: string }).from = columnName;
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
    (_columnName: string, transformId: string, updates: Partial<IngestTransform>) => {
      onTransformsChange(transforms.map((t) => (t.id === transformId ? ({ ...t, ...updates } as IngestTransform) : t)));
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

  const handleUpdateConcatenate = useCallback(
    (transformId: string, updates: Partial<IngestTransform>) => {
      onTransformsChange(transforms.map((t) => (t.id === transformId ? ({ ...t, ...updates } as IngestTransform) : t)));
    },
    [transforms, onTransformsChange]
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow className="border-primary/10 bg-card/20">
              <TableHead className="text-foreground w-[30%] font-medium">{t("sourceColumn")}</TableHead>
              <TableHead className="text-foreground w-[35%] font-medium">{t("flowTransforms")}</TableHead>
              <TableHead className="text-foreground w-[25%] font-medium">{t("flowTargetField")}</TableHead>
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
                isSplitParent={row.isSplitParent}
                splitChildren={row.splitChildren}
                splitChildTransforms={row.splitChildTransforms}
                splitChildTargets={row.splitChildTargets}
                geocodingEnabled={geocodingEnabled}
                onGeocodingChange={onGeocodingChange}
              />
            ))}

            {/* Concatenate virtual rows */}
            {concatTransforms.map((ct) => (
              <CombinedRow
                key={ct.id}
                transform={ct}
                assignedTargets={assignedTargets}
                fieldMapping={fieldMapping}
                sourceColumns={headers}
                onTargetChange={handleTargetChange}
                onUpdate={handleUpdateConcatenate}
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

      {/* Geocoding is now inline in the ColumnRow when target is locationField */}
    </div>
  );
};
