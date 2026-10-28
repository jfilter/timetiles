/**
 * Wizard store slice for the import source: the loaded file or URL preview,
 * URL credentials, JSON API settings and the schedule configuration.
 *
 * @module
 * @category Components
 */
import { createFieldMappingFromSuggestions } from "@/lib/ingest/field-mapping-utils";
import { humanizeFileName } from "@/lib/ingest/humanize-file-name";
import type { SheetInfo } from "@/lib/ingest/types/wizard";

import type { WizardSlice, WizardSourceActions } from "./wizard-state";

export const createSourceSlice: WizardSlice<WizardSourceActions> = (set, get) => ({
  loadFile: ({ file, sheets, previewId, sourceUrl, configSuggestions }) => {
    const state = get();
    const getDatasetName = (sheet: SheetInfo) => {
      if (sheets.length === 1 && file?.name) {
        return humanizeFileName(file.name);
      }
      return sheet.name;
    };

    // In edit mode with an existing dataset, pre-select it instead of "new"
    const editDatasetId = state.editMode ? (state.editScheduleData?.datasetId ?? null) : null;

    set({
      file,
      sheets,
      previewId,
      sourceUrl: sourceUrl ?? state.sourceUrl,
      configSuggestions: configSuggestions ?? [],
      sheetMappings: sheets.map((sheet) => ({
        sheetIndex: sheet.index,
        datasetId: editDatasetId ?? ("new" as const),
        newDatasetName: getDatasetName(sheet),
        similarityScore: null,
      })),
      fieldMappings: sheets.map((sheet) =>
        createFieldMappingFromSuggestions(sheet.index, sheet.suggestedMappings?.mappings)
      ),
    });
  },

  setSourceUrlInput: (sourceUrl, authConfig) =>
    // `null` is an explicit "clear the credentials" (auth type "none") —
    // only an omitted argument keeps the previous value. `??` would
    // silently resurrect removed credentials into a created schedule.
    set((s) => ({ sourceUrl, authConfig: authConfig === undefined ? s.authConfig : authConfig })),

  setUrlAuth: (authConfig) => set({ authConfig }),

  configureSchedule: (scheduleConfig) => set({ scheduleConfig }),

  setJsonApiInput: (jsonApiConfig) => set({ jsonApiConfig }),

  unloadFile: () =>
    set((s) => ({
      file: null,
      sheets: [],
      previewId: null,
      sheetMappings: [],
      fieldMappings: [],
      transforms: {},
      configSuggestions: [],
      // In edit mode, preserve schedule-level config so it isn't lost on re-fetch
      sourceUrl: s.editMode ? s.sourceUrl : null,
      authConfig: s.editMode ? s.authConfig : null,
      jsonApiConfig: s.editMode ? s.jsonApiConfig : null,
      scheduleConfig: s.editMode ? s.scheduleConfig : null,
    })),
});
