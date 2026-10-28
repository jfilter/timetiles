/**
 * Wizard store slice for import targets and mapping: catalog and dataset
 * selection, field mappings, transforms and import options.
 *
 * @module
 * @category Components
 */
import { clearRemovedColumns, getMappingColumnNames } from "@/lib/ingest/column-view";
import { createFieldMappingFromSuggestions } from "@/lib/ingest/field-mapping-utils";
import type { ConfigSuggestion, FieldMapping } from "@/lib/ingest/types/wizard";

import type { WizardMappingActions, WizardSlice, WizardState } from "./wizard-state";

/** Update an item in a sheet-indexed array by finding its sheetIndex and merging partial updates. */
const updateBySheetIndex = <T extends { sheetIndex: number }>(
  items: T[],
  sheetIndex: number,
  update: Partial<T>
): T[] => {
  const result = [...items];
  const index = result.findIndex((m) => m.sheetIndex === sheetIndex);
  const current = result[index];
  if (index >= 0 && current) {
    result[index] = { ...current, ...update, sheetIndex: current.sheetIndex };
  }
  return result;
};

/**
 * Merge a suggested dataset plan's roles into a sheet's field mapping, keeping
 * only roles whose raw or generated column exists in that sheet's mapping view.
 *
 * Copying a role path whose column isn't in the target sheet leaves
 * `fieldMapping.titleField = "title"` pointing at a column that doesn't
 * exist, which the row UI then marks as "taken" in `assignedTargets` and
 * disables in every select — the user gets stuck unable to reassign.
 */
const mergeFieldMappingOverrides = (
  currentFm: FieldMapping,
  plan: ConfigSuggestion["config"]["interpretationPlan"],
  idStrategy: ConfigSuggestion["config"]["idStrategy"],
  sheetHeaders: readonly string[]
): FieldMapping => {
  const headerSet = new Set(getMappingColumnNames(sheetHeaders, plan?.ops ?? []));
  const keepIfPresent = (path: string | undefined | null): string | undefined =>
    path != null && headerSet.has(path) ? path : undefined;
  const roles = plan?.roles ?? {};

  return {
    ...currentFm,
    titleField: keepIfPresent(roles.title) ?? currentFm.titleField,
    descriptionField: keepIfPresent(roles.description) ?? currentFm.descriptionField,
    locationNameField: keepIfPresent(roles.locationName) ?? currentFm.locationNameField,
    dateField: keepIfPresent(roles.timestamp) ?? currentFm.dateField,
    endDateField: keepIfPresent(roles.endTimestamp) ?? currentFm.endDateField,
    locationField: keepIfPresent(roles.location) ?? currentFm.locationField,
    latitudeField: keepIfPresent(roles.latitude) ?? currentFm.latitudeField,
    longitudeField: keepIfPresent(roles.longitude) ?? currentFm.longitudeField,
    idStrategy: (idStrategy?.type as FieldMapping["idStrategy"]) ?? currentFm.idStrategy,
    idField: keepIfPresent(idStrategy?.externalIdPath) ?? currentFm.idField,
  };
};

export const createMappingSlice: WizardSlice<WizardMappingActions> = (set) => ({
  selectCatalog: (catalogId, newCatalogName) =>
    set((s) => ({ selectedCatalogId: catalogId, newCatalogName: newCatalogName ?? s.newCatalogName })),

  setDatasetTarget: (sheetIndex, mapping) =>
    set((s) => ({ sheetMappings: updateBySheetIndex(s.sheetMappings, sheetIndex, mapping) })),

  applyDatasetSelectionSuggestion: ({ catalogId, sheetMatches }) =>
    set((s) => {
      // Atomically set the catalog and matching sheet mappings in one
      // store update so consumers can never observe a half-applied
      // intermediate state (e.g. catalog set but sheet mappings still
      // "new"). This is the user-initiated counterpart to the prior
      // auto-apply effect and replaces the multi-call sequence that
      // produced reset/re-fire bugs.
      let nextSheetMappings = s.sheetMappings;
      for (const match of sheetMatches) {
        nextSheetMappings = updateBySheetIndex(nextSheetMappings, match.sheetIndex, {
          datasetId: match.datasetId,
          similarityScore: match.similarityScore ?? null,
        });
      }
      return { selectedCatalogId: catalogId, sheetMappings: nextSheetMappings };
    }),

  setFieldMapping: (sheetIndex, mapping) =>
    set((s) => ({ fieldMappings: updateBySheetIndex(s.fieldMappings, sheetIndex, mapping) })),

  setTransforms: (sheetIndex, transforms) =>
    set((s) => {
      const headers = s.sheets.find((sheet) => sheet.index === sheetIndex)?.headers ?? [];
      const fieldMappings = s.fieldMappings.map((mapping) => {
        if (mapping.sheetIndex !== sheetIndex) return mapping;
        return clearRemovedColumns(mapping, headers, s.transforms[sheetIndex] ?? [], transforms);
      });
      return { transforms: { ...s.transforms, [sheetIndex]: transforms }, fieldMappings };
    }),

  setImportOptions: (options) =>
    set((s) => ({
      deduplicationStrategy: options.deduplicationStrategy ?? s.deduplicationStrategy,
      geocodingEnabled: options.geocodingEnabled ?? s.geocodingEnabled,
    })),

  applyFieldMappingSuggestion: (sheetIndex, config) =>
    set((s) => {
      const updatedFieldMappings = [...s.fieldMappings];
      const fmIndex = updatedFieldMappings.findIndex((m) => m.sheetIndex === sheetIndex);
      const currentFm = updatedFieldMappings[fmIndex];
      const sheet = s.sheets.find((sh) => sh.index === sheetIndex);
      const headers = sheet?.headers ?? [];
      const planOps = config.interpretationPlan?.ops;

      if (fmIndex >= 0 && currentFm) {
        const retainedMapping = planOps
          ? clearRemovedColumns(currentFm, headers, s.transforms[sheetIndex] ?? [], planOps)
          : currentFm;
        updatedFieldMappings[fmIndex] = mergeFieldMappingOverrides(
          retainedMapping,
          config.interpretationPlan,
          config.idStrategy,
          headers
        );
      }

      const updatedTransforms = { ...s.transforms };
      if (planOps != null) {
        updatedTransforms[sheetIndex] = planOps;
      }

      return {
        fieldMappings: updatedFieldMappings,
        transforms: updatedTransforms,
        deduplicationStrategy:
          (config.idStrategy?.duplicateStrategy as WizardState["deduplicationStrategy"]) ?? s.deduplicationStrategy,
        geocodingEnabled: config.geocodingEnabled ?? s.geocodingEnabled,
      };
    }),

  resetFieldMappingToAutoDetected: (sheetIndex) =>
    set((s) => {
      const sheet = s.sheets.find((sh) => sh.index === sheetIndex);
      const updatedMappings = [...s.fieldMappings];
      const resetIndex = updatedMappings.findIndex((m) => m.sheetIndex === sheetIndex);
      if (resetIndex >= 0 && sheet) {
        updatedMappings[resetIndex] = createFieldMappingFromSuggestions(sheetIndex, sheet.suggestedMappings?.mappings);
      }
      const updatedTransforms = { ...s.transforms };
      delete updatedTransforms[sheetIndex];

      return { fieldMappings: updatedMappings, transforms: updatedTransforms };
    }),
});
