/**
 * Factory functions for creating FieldMapping objects.
 *
 * Centralizes FieldMapping initialization to avoid duplicating the field list
 * across the wizard reducer, flow editor, and other consumers.
 *
 * @module
 * @category Import
 */
import type { FieldMapping, FieldMappingStringField, SuggestedMappings } from "@/lib/types/import-wizard";

/** Create a FieldMapping with all fields set to null/defaults. */
export const createEmptyFieldMapping = (sheetIndex: number): FieldMapping => ({
  sheetIndex,
  titleField: null,
  descriptionField: null,
  locationNameField: null,
  dateField: null,
  idField: null,
  idStrategy: "auto",
  locationField: null,
  latitudeField: null,
  longitudeField: null,
});

/** All FieldMapping keys that hold `string | null` column names. */
const FIELD_MAPPING_STRING_KEYS: readonly FieldMappingStringField[] = [
  "titleField",
  "descriptionField",
  "locationNameField",
  "dateField",
  "idField",
  "locationField",
  "latitudeField",
  "longitudeField",
] as const;

/** Type-safe setter: assigns `value` to `fieldKey` only if it's a valid string field. */
export const setMappingField = (mapping: FieldMapping, fieldKey: string, value: string): void => {
  if ((FIELD_MAPPING_STRING_KEYS as readonly string[]).includes(fieldKey)) {
    mapping[fieldKey as FieldMappingStringField] = value;
  }
};

/** Create a FieldMapping pre-filled from auto-detected suggestions. */
export const createFieldMappingFromSuggestions = (
  sheetIndex: number,
  suggestions?: SuggestedMappings["mappings"]
): FieldMapping => ({
  sheetIndex,
  titleField: suggestions?.titlePath.path ?? null,
  descriptionField: suggestions?.descriptionPath.path ?? null,
  locationNameField: suggestions?.locationNamePath?.path ?? null,
  dateField: suggestions?.timestampPath.path ?? null,
  idField: null,
  idStrategy: "auto",
  locationField: suggestions?.locationPath.path ?? null,
  latitudeField: suggestions?.latitudePath.path ?? null,
  longitudeField: suggestions?.longitudePath.path ?? null,
});
