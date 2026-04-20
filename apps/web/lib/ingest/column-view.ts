/**
 * Pure helpers for building the column-centric view used by the field mapping table.
 *
 * Extracted from the column-mapping-table component so that both the
 * component and unit tests can import without pulling in React/UI dependencies.
 *
 * @module
 * @category Import
 */
import type {
  ConfidenceLevel,
  FieldMapping,
  FieldMappingStringField,
  IngestTransform,
  SuggestedMappings,
} from "@/lib/ingest/types/wizard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Constants
// ---------------------------------------------------------------------------

/** All FieldMapping keys that hold `string | null` column names (UI-visible subset). */
export const FIELD_MAPPING_STRING_KEYS: FieldMappingStringField[] = [
  "titleField",
  "dateField",
  "endDateField",
  "descriptionField",
  "locationNameField",
  "locationField",
  "latitudeField",
  "longitudeField",
  "idField",
];

/** Mapping between FieldMapping keys and SuggestedMappings keys. */
const FIELD_TO_SUGGESTION_KEY: Partial<Record<FieldMappingStringField, keyof SuggestedMappings["mappings"]>> = {
  titleField: "titlePath",
  dateField: "timestampPath",
  endDateField: "endTimestampPath",
  descriptionField: "descriptionPath",
  locationNameField: "locationNamePath",
  locationField: "locationPath",
  latitudeField: "latitudePath",
  longitudeField: "longitudePath",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
