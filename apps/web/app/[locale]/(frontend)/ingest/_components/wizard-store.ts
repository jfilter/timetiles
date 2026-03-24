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

import { createFieldMappingFromSuggestions } from "@/lib/ingest/field-mapping-utils";
import { humanizeFileName } from "@/lib/ingest/humanize-file-name";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import type {
  ConfigSuggestion,
  FieldMapping,
  JsonApiScheduleConfig,
  SheetInfo,
  SheetMapping,
  UrlAuthConfig,
} from "@/lib/types/ingest-wizard";

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

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "timetiles-wizard-v2";
const STORAGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

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
            const maxStep = s.editMode ? 6 : 7;
            let next = Math.min(s.currentStep + 1, maxStep) as WizardStep;
            // Skip Schedule step for file uploads (no URL = no schedule)
            if (next === 5 && !s.sourceUrl) next = 6;
            return { currentStep: next };
          }),

        prevStep: () =>
          set((s) => {
            let prev = Math.max(s.currentStep - 1, 1) as WizardStep;
            // Skip Schedule step going back if no URL
            if (prev === 5 && !s.sourceUrl) prev = 4;
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
          set((s) => {
            const mappings = [...s.sheetMappings];
            const index = mappings.findIndex((m) => m.sheetIndex === sheetIndex);
            const current = mappings[index];
            if (index >= 0 && current) {
              mappings[index] = { ...current, ...mapping, sheetIndex: current.sheetIndex };
            }
            return { sheetMappings: mappings };
          }),

        setFieldMapping: (sheetIndex, mapping) =>
          set((s) => {
            const mappings = [...s.fieldMappings];
            const index = mappings.findIndex((m) => m.sheetIndex === sheetIndex);
            const current = mappings[index];
            if (index >= 0 && current) {
              mappings[index] = { ...current, ...mapping, sheetIndex: current.sheetIndex };
            }
            return { fieldMappings: mappings };
          }),

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
                locationField: overrides.locationPath ?? currentFm.locationField,
                latitudeField: overrides.latitudePath ?? currentFm.latitudeField,
                longitudeField: overrides.longitudePath ?? currentFm.longitudeField,
                idStrategy: (config.idStrategy?.type as FieldMapping["idStrategy"]) ?? currentFm.idStrategy,
                idField: config.idStrategy?.externalIdPath ?? currentFm.idField,
              };
            }

            const updatedTransforms = { ...s.transforms };
            if (config.ingestTransforms && config.ingestTransforms.length > 0) {
              // Validate suggested transforms have the required shape before applying
              const validTransforms = config.ingestTransforms.filter(
                (t): t is IngestTransform =>
                  typeof t === "object" &&
                  t !== null &&
                  "id" in t &&
                  "type" in t &&
                  typeof (t as Record<string, unknown>).type === "string" &&
                  ["rename", "date-parse", "string-op", "concatenate", "split"].includes(
                    (t as Record<string, unknown>).type as string
                  )
              );
              if (validTransforms.length > 0) {
                updatedTransforms[sheetIndex] = validTransforms;
              }
            }

            return {
              fieldMappings: updatedFieldMappings,
              transforms: updatedTransforms,
              deduplicationStrategy:
                (config.deduplicationConfig?.strategy as WizardState["deduplicationStrategy"]) ??
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
          useWizardStore.persist.clearStorage();
          set({ ...initialState, _initialized: true });
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
