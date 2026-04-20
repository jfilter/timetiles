/**
 * Zustand store for import wizard state management.
 *
 * Replaces the previous React Context + useReducer approach with a global
 * store that provides:
 * - Direct access from any component (no Provider needed)
 * - Granular subscriptions (components re-render only on their slice)
 * - Built-in localStorage persistence via `persist` middleware
 * - DevTools integration via `devtools` middleware
 *
 * The store is initialized with server-provided auth state via
 * {@link useWizardEffects} in the layout component.
 *
 * @module
 * @category Components
 */
"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { createFieldMappingFromSuggestions } from "@/lib/ingest/field-mapping-utils";
import { humanizeFileName } from "@/lib/ingest/humanize-file-name";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type {
  ConfigSuggestion,
  FieldMapping,
  JsonApiScheduleConfig,
  SheetInfo,
  SheetMapping,
  UrlAuthConfig,
} from "@/lib/ingest/types/wizard";

// ─── State Types ─────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CatalogSelection = number | "new" | null;

export interface ScheduleConfig {
  enabled: boolean;
  name: string;
  scheduleType: "frequency" | "cron";
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression: string;
  schemaMode: "strict" | "additive" | "flexible";
}

export interface JsonApiConfig extends JsonApiScheduleConfig {
  wasAutoDetected?: boolean;
}

export interface EditScheduleData {
  sourceUrl: string;
  authConfig: UrlAuthConfig | null;
  jsonApiConfig: JsonApiConfig | null;
  selectedCatalogId: number;
  scheduleConfig: ScheduleConfig;
  /** Existing dataset ID to use instead of creating "new" on re-fetch */
  datasetId: number | null;
}

export interface WizardState {
  currentStep: WizardStep;
  startedAuthenticated: boolean;
  editMode: boolean;
  editScheduleId: number | null;
  /** Dataset ID from the schedule being edited — used by setFile to pre-select instead of "new" */
  _editDatasetId: number | null;
  previewId: string | null;
  file: { name: string; size: number; mimeType: string } | null;
  sheets: SheetInfo[];
  sourceUrl: string | null;
  authConfig: UrlAuthConfig | null;
  jsonApiConfig: JsonApiConfig | null;
  selectedCatalogId: CatalogSelection;
  newCatalogName: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  transforms: Record<number, IngestTransform[]>;
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  scheduleConfig: ScheduleConfig | null;
  configSuggestions: ConfigSuggestion[];
  ingestFileId: number | null;
  scheduledIngestId: number | null;
  error: string | null;
}

interface WizardActions {
  initialize: (auth: { isAuthenticated: boolean; isEmailVerified: boolean }) => void;
  initializeForEdit: (scheduleId: number, data: EditScheduleData) => void;
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setFile: (
    file: WizardState["file"],
    sheets: SheetInfo[],
    previewId: string,
    sourceUrl?: string,
    configSuggestions?: ConfigSuggestion[]
  ) => void;
  setSourceUrl: (sourceUrl: string | null, authConfig?: UrlAuthConfig | null) => void;
  setAuthConfig: (config: UrlAuthConfig | null) => void;
  setScheduleConfig: (config: ScheduleConfig | null) => void;
  setJsonApiConfig: (config: JsonApiConfig | null) => void;
  clearFile: () => void;
  setCatalog: (catalogId: number | "new" | null, newCatalogName?: string) => void;
  setSheetMapping: (sheetIndex: number, mapping: Partial<SheetMapping>) => void;
  setFieldMapping: (sheetIndex: number, mapping: Partial<FieldMapping>) => void;
  setTransforms: (sheetIndex: number, transforms: IngestTransform[]) => void;
  setImportOptions: (options: {
    deduplicationStrategy?: WizardState["deduplicationStrategy"];
    geocodingEnabled?: boolean;
  }) => void;
  startProcessing: (ingestFileId: number, scheduledIngestId?: number) => void;
  setError: (error: string | null) => void;
  applyDatasetConfig: (sheetIndex: number, config: ConfigSuggestion["config"]) => void;
  resetToAutoDetected: (sheetIndex: number) => void;
  complete: () => void;
  reset: () => void;
}

type WizardStore = WizardState & WizardActions & { _initialized: boolean; _savedAt: number };

// ─── Initial State ───────────────────────────────────────────────────────────

export const initialState: WizardState = {
  currentStep: 1,
  startedAuthenticated: false,
  editMode: false,
  editScheduleId: null,
  _editDatasetId: null,
  previewId: null,
  file: null,
  sheets: [],
  sourceUrl: null,
  authConfig: null,
  jsonApiConfig: null,
  selectedCatalogId: null,
  newCatalogName: "",
  sheetMappings: [],
  fieldMappings: [],
  transforms: {},
  deduplicationStrategy: "skip",
  geocodingEnabled: true,
  scheduleConfig: null,
  configSuggestions: [],
  ingestFileId: null,
  scheduledIngestId: null,
  error: null,
};

// Step definitions — single source of truth for titles and labels
export const WIZARD_STEPS: ReadonlyArray<{ step: WizardStep; title: string; label: string; shortLabel: string }> = [
  { step: 1, title: "Sign In", label: "Sign In", shortLabel: "Auth" },
  { step: 2, title: "Upload File", label: "Upload", shortLabel: "Upload" },
  { step: 3, title: "Select Dataset", label: "Dataset", shortLabel: "Dataset" },
  { step: 4, title: "Map Fields", label: "Mapping", shortLabel: "Map" },
  { step: 5, title: "Schedule", label: "Schedule", shortLabel: "Schedule" },
  { step: 6, title: "Review", label: "Review", shortLabel: "Review" },
  { step: 7, title: "Processing", label: "Import", shortLabel: "Import" },
];

export const STEP_TITLES: Record<WizardStep, string> = Object.fromEntries(
  WIZARD_STEPS.map((s) => [s.step, s.title])
) as Record<WizardStep, string>;

/** Maximum wizard step (last step in the array). */
const MAX_STEP = WIZARD_STEPS.length as WizardStep;

/** In edit mode, stop before the processing step. */
const EDIT_MAX_STEP = (MAX_STEP - 1) as WizardStep;

/** Step index for the schedule configuration. Skipped for file uploads (no URL). */
const SCHEDULE_STEP: WizardStep = 5;

/** Step index for the review screen (follows the schedule step). */
const REVIEW_STEP: WizardStep = 6;

/** Step index for field mapping (precedes the schedule step). */
const MAPPING_STEP: WizardStep = 4;

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "timetiles-wizard-v2";
const STORAGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

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

// ─── Store ───────────────────────────────────────────────────────────────────

export const useWizardStore = create<WizardStore>()(
  devtools(
    persist(
      // eslint-disable-next-line sonarjs/max-lines-per-function -- Zustand store definition with 16 actions
      (set, get) => ({
        ...initialState,
        _initialized: false,
        _savedAt: 0,

        initialize: (auth) => {
          if (get()._initialized) return;
          const wasAuthenticated = auth.isAuthenticated && auth.isEmailVerified;
          set({ _initialized: true, startedAuthenticated: wasAuthenticated, currentStep: wasAuthenticated ? 2 : 1 });
        },

        initializeForEdit: (scheduleId, data) => {
          // Reset first to clear any previous wizard state
          useWizardStore.persist?.clearStorage();
          set({
            ...initialState,
            _initialized: true,
            editMode: true,
            editScheduleId: scheduleId,
            startedAuthenticated: true,
            currentStep: 2,
            sourceUrl: data.sourceUrl,
            authConfig: data.authConfig,
            jsonApiConfig: data.jsonApiConfig,
            selectedCatalogId: data.selectedCatalogId,
            scheduleConfig: data.scheduleConfig,
            _editDatasetId: data.datasetId,
          });
        },

        goToStep: (step) => set({ currentStep: step }),

        nextStep: () =>
          set((s) => {
            const max = s.editMode ? EDIT_MAX_STEP : MAX_STEP;
            let next = Math.min(s.currentStep + 1, max) as WizardStep;
            // Skip Schedule step for file uploads (no URL = no schedule)
            if (next === SCHEDULE_STEP && !s.sourceUrl) next = REVIEW_STEP;
            return { currentStep: next };
          }),

        prevStep: () =>
          set((s) => {
            let prev = Math.max(s.currentStep - 1, 1) as WizardStep;
            // Skip Schedule step going back if no URL
            if (prev === SCHEDULE_STEP && !s.sourceUrl) prev = MAPPING_STEP;
            return { currentStep: prev };
          }),

        setFile: (file, sheets, previewId, sourceUrl, configSuggestions) => {
          const state = get();
          const getDatasetName = (sheet: SheetInfo) => {
            if (sheets.length === 1 && file?.name) {
              return humanizeFileName(file.name);
            }
            return sheet.name;
          };

          // In edit mode with an existing dataset, pre-select it instead of "new"
          const editDatasetId = state.editMode ? state._editDatasetId : null;

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

        setSourceUrl: (sourceUrl, authConfig) => set((s) => ({ sourceUrl, authConfig: authConfig ?? s.authConfig })),

        setAuthConfig: (authConfig) => set({ authConfig }),

        setScheduleConfig: (scheduleConfig) => set({ scheduleConfig }),

        setJsonApiConfig: (jsonApiConfig) => set({ jsonApiConfig }),

        clearFile: () =>
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

        setCatalog: (catalogId, newCatalogName) =>
          set((s) => ({ selectedCatalogId: catalogId, newCatalogName: newCatalogName ?? s.newCatalogName })),

        setSheetMapping: (sheetIndex, mapping) =>
          set((s) => ({ sheetMappings: updateBySheetIndex(s.sheetMappings, sheetIndex, mapping) })),

        setFieldMapping: (sheetIndex, mapping) =>
          set((s) => ({ fieldMappings: updateBySheetIndex(s.fieldMappings, sheetIndex, mapping) })),

        setTransforms: (sheetIndex, transforms) =>
          set((s) => ({ transforms: { ...s.transforms, [sheetIndex]: transforms } })),

        setImportOptions: (options) =>
          set((s) => ({
            deduplicationStrategy: options.deduplicationStrategy ?? s.deduplicationStrategy,
            geocodingEnabled: options.geocodingEnabled ?? s.geocodingEnabled,
          })),

        startProcessing: (ingestFileId, scheduledIngestId) =>
          set({ ingestFileId, scheduledIngestId: scheduledIngestId ?? null, error: null }),

        setError: (error) => set({ error }),

        applyDatasetConfig: (sheetIndex, config) =>
          set((s) => {
            const overrides = config.fieldMappingOverrides;
            const updatedFieldMappings = [...s.fieldMappings];
            const fmIndex = updatedFieldMappings.findIndex((m) => m.sheetIndex === sheetIndex);
            const currentFm = updatedFieldMappings[fmIndex];

            if (fmIndex >= 0 && currentFm) {
              updatedFieldMappings[fmIndex] = {
                ...currentFm,
                titleField: overrides.titlePath ?? currentFm.titleField,
                descriptionField: overrides.descriptionPath ?? currentFm.descriptionField,
                locationNameField: overrides.locationNamePath ?? currentFm.locationNameField,
                dateField: overrides.timestampPath ?? currentFm.dateField,
                endDateField: overrides.endTimestampPath ?? currentFm.endDateField,
                locationField: overrides.locationPath ?? currentFm.locationField,
                latitudeField: overrides.latitudePath ?? currentFm.latitudeField,
                longitudeField: overrides.longitudePath ?? currentFm.longitudeField,
                idStrategy: (config.idStrategy?.type as FieldMapping["idStrategy"]) ?? currentFm.idStrategy,
                idField: config.idStrategy?.externalIdPath ?? currentFm.idField,
              };
            }

            const updatedTransforms = { ...s.transforms };
            if (config.ingestTransforms != null) {
              updatedTransforms[sheetIndex] = config.ingestTransforms;
            }

            return {
              fieldMappings: updatedFieldMappings,
              transforms: updatedTransforms,
              deduplicationStrategy:
                (config.idStrategy?.duplicateStrategy as WizardState["deduplicationStrategy"]) ??
                s.deduplicationStrategy,
              geocodingEnabled: config.geocodingEnabled ?? s.geocodingEnabled,
            };
          }),

        resetToAutoDetected: (sheetIndex) =>
          set((s) => {
            const sheet = s.sheets.find((sh) => sh.index === sheetIndex);
            const updatedMappings = [...s.fieldMappings];
            const resetIndex = updatedMappings.findIndex((m) => m.sheetIndex === sheetIndex);
            if (resetIndex >= 0 && sheet) {
              updatedMappings[resetIndex] = createFieldMappingFromSuggestions(
                sheetIndex,
                sheet.suggestedMappings?.mappings
              );
            }
            const updatedTransforms = { ...s.transforms };
            delete updatedTransforms[sheetIndex];

            return { fieldMappings: updatedMappings, transforms: updatedTransforms };
          }),

        complete: () => {
          get().reset();
        },

        reset: () => {
          useWizardStore.persist.clearStorage();
          set({ ...initialState, _initialized: true });
        },
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        partialize: (state) => {
          // Never persist auth credentials, internal flags, edit mode, or sensitive state
          const {
            startedAuthenticated,
            _initialized,
            _savedAt,
            authConfig,
            editMode,
            editScheduleId,
            _editDatasetId,
            ...rest
          } = state;
          // Don't save during processing or in edit mode
          if (rest.currentStep === 7 || editMode) return {} as Partial<WizardState>;
          return { ...rest, _savedAt: Date.now() } as Partial<WizardState> & { _savedAt: number };
        },
        merge: (persisted, current) => {
          if (!persisted || typeof persisted !== "object") return current;
          const p = persisted as Partial<WizardState> & { _savedAt?: number };
          // Check expiry
          if (p._savedAt && Date.now() - p._savedAt > STORAGE_EXPIRY_MS) {
            return current;
          }
          return { ...current, ...p };
        },
      }
    ),
    { name: "WizardStore" }
  )
);

/**
 * Shared shallow-selector wrapper for grouped step hooks.
 *
 * Keeps step components concise without broadening their subscriptions to the
 * entire store.
 */
const useWizardStepSlice = <T>(selector: (state: WizardStore) => T): T => useWizardStore(useShallow(selector));

export const useWizardUploadStepState = () =>
  useWizardStepSlice((state) => ({
    file: state.file,
    sheets: state.sheets,
    sourceUrl: state.sourceUrl,
    editMode: state.editMode,
    authConfig: state.authConfig,
    jsonApiConfig: state.jsonApiConfig,
    nextStep: state.nextStep,
    setFile: state.setFile,
    setSourceUrl: state.setSourceUrl,
    setJsonApiConfig: state.setJsonApiConfig,
    clearFile: state.clearFile,
  }));

export const useWizardDatasetSelectionStepState = () =>
  useWizardStepSlice((state) => ({
    sheets: state.sheets,
    selectedCatalogId: state.selectedCatalogId,
    newCatalogName: state.newCatalogName,
    sheetMappings: state.sheetMappings,
    configSuggestions: state.configSuggestions,
    fileName: state.file?.name,
    nextStep: state.nextStep,
    setCatalog: state.setCatalog,
    setSheetMapping: state.setSheetMapping,
  }));

export const useWizardFieldMappingStepState = () =>
  useWizardStepSlice((state) => ({
    sheets: state.sheets,
    fieldMappings: state.fieldMappings,
    sheetMappings: state.sheetMappings,
    deduplicationStrategy: state.deduplicationStrategy,
    geocodingEnabled: state.geocodingEnabled,
    previewId: state.previewId,
    transforms: state.transforms,
    configSuggestions: state.configSuggestions,
    nextStep: state.nextStep,
    setFieldMapping: state.setFieldMapping,
    setImportOptions: state.setImportOptions,
    setTransforms: state.setTransforms,
    applyDatasetConfig: state.applyDatasetConfig,
    resetToAutoDetected: state.resetToAutoDetected,
  }));

export const useWizardScheduleStepState = () =>
  useWizardStepSlice((state) => ({
    sourceUrl: state.sourceUrl,
    scheduleConfig: state.scheduleConfig,
    authConfig: state.authConfig,
    file: state.file,
    editMode: state.editMode,
    nextStep: state.nextStep,
    prevStep: state.prevStep,
    setScheduleConfig: state.setScheduleConfig,
    setAuthConfig: state.setAuthConfig,
  }));

export const useWizardReviewStepState = () =>
  useWizardStepSlice((state) => ({
    file: state.file,
    sheets: state.sheets,
    selectedCatalogId: state.selectedCatalogId,
    newCatalogName: state.newCatalogName,
    sheetMappings: state.sheetMappings,
    fieldMappings: state.fieldMappings,
    deduplicationStrategy: state.deduplicationStrategy,
    geocodingEnabled: state.geocodingEnabled,
    sourceUrl: state.sourceUrl,
    authConfig: state.authConfig,
    scheduleConfig: state.scheduleConfig,
    jsonApiConfig: state.jsonApiConfig,
    previewId: state.previewId,
    transforms: state.transforms,
    error: state.error,
    editMode: state.editMode,
    editScheduleId: state.editScheduleId,
    prevStep: state.prevStep,
    startProcessing: state.startProcessing,
    nextStep: state.nextStep,
    setError: state.setError,
  }));

export const useWizardPreviewValidationState = () =>
  useWizardStepSlice((state) => ({
    previewId: state.previewId,
    currentStep: state.currentStep,
    startedAuthenticated: state.startedAuthenticated,
    ingestFileId: state.ingestFileId,
    editMode: state.editMode,
  }));

export const useWizardProceedState = () =>
  useWizardStepSlice((state) => ({
    currentStep: state.currentStep,
    file: state.file,
    sheets: state.sheets,
    selectedCatalogId: state.selectedCatalogId,
    sheetMappings: state.sheetMappings,
    fieldMappings: state.fieldMappings,
  }));
