/**
 * State shape, action contracts and step constants of the import wizard store.
 *
 * The store itself is composed in {@link useWizardStore} from the navigation,
 * source and mapping slices; each slice implements one action group below.
 *
 * @module
 * @category Components
 */
import type { StateCreator } from "zustand";

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
  /**
   * Dataset preference embedded in the schedule being edited — used by loadFile
   * to pre-select an existing dataset instead of defaulting to "new" on re-fetch.
   */
  editScheduleData: { datasetId: number | null } | null;
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

// ─── Action Types ────────────────────────────────────────────────────────────

/** Step navigation and wizard lifecycle. */
export interface WizardNavigationActions {
  initialize: (auth: { isAuthenticated: boolean; isEmailVerified: boolean }) => void;
  initializeForEdit: (scheduleId: number, data: EditScheduleData) => void;
  recoverFromInvalidPreview: (targetStep: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  startProcessing: (params: { ingestFileId: number; scheduledIngestId?: number }) => void;
  setError: (error: string | null) => void;
  complete: () => void;
  reset: () => void;
}

/** The uploaded file or fetched URL and its schedule settings. */
export interface WizardSourceActions {
  loadFile: (params: {
    file: WizardState["file"];
    sheets: SheetInfo[];
    previewId: string;
    sourceUrl?: string;
    configSuggestions?: ConfigSuggestion[];
  }) => void;
  setSourceUrlInput: (sourceUrl: string | null, authConfig?: UrlAuthConfig | null) => void;
  setUrlAuth: (config: UrlAuthConfig | null) => void;
  configureSchedule: (config: ScheduleConfig | null) => void;
  setJsonApiInput: (config: JsonApiConfig | null) => void;
  unloadFile: () => void;
}

/** Catalog and dataset targets, field mappings, transforms and import options. */
export interface WizardMappingActions {
  selectCatalog: (catalogId: number | "new" | null, newCatalogName?: string) => void;
  setDatasetTarget: (sheetIndex: number, mapping: Partial<SheetMapping>) => void;
  applyDatasetSelectionSuggestion: (params: {
    catalogId: number;
    sheetMatches: Array<{ sheetIndex: number; datasetId: number; similarityScore?: number | null }>;
  }) => void;
  setFieldMapping: (sheetIndex: number, mapping: Partial<FieldMapping>) => void;
  setTransforms: (sheetIndex: number, transforms: IngestTransform[]) => void;
  setImportOptions: (options: {
    deduplicationStrategy?: WizardState["deduplicationStrategy"];
    geocodingEnabled?: boolean;
  }) => void;
  applyFieldMappingSuggestion: (sheetIndex: number, config: ConfigSuggestion["config"]) => void;
  resetFieldMappingToAutoDetected: (sheetIndex: number) => void;
}

export type WizardStore = WizardState &
  WizardNavigationActions &
  WizardSourceActions &
  WizardMappingActions & { _initialized: boolean; _savedAt: number };

/** A slice creator running inside the store's devtools and persist middleware. */
export type WizardSlice<T> = StateCreator<
  WizardStore,
  [["zustand/devtools", never], ["zustand/persist", unknown]],
  [],
  T
>;

// ─── Initial State ───────────────────────────────────────────────────────────

export const initialState: WizardState = {
  currentStep: 1,
  startedAuthenticated: false,
  editMode: false,
  editScheduleId: null,
  editScheduleData: null,
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

// Step definitions — single source of truth for labels
export const WIZARD_STEPS: ReadonlyArray<{ step: WizardStep; label: string; shortLabel: string }> = [
  { step: 1, label: "Sign In", shortLabel: "Auth" },
  { step: 2, label: "Upload", shortLabel: "Upload" },
  { step: 3, label: "Dataset", shortLabel: "Dataset" },
  { step: 4, label: "Mapping", shortLabel: "Map" },
  { step: 5, label: "Schedule", shortLabel: "Schedule" },
  { step: 6, label: "Review", shortLabel: "Review" },
  { step: 7, label: "Import", shortLabel: "Import" },
];

/** Maximum wizard step (last step in the array). */
export const MAX_STEP = WIZARD_STEPS.length as WizardStep;
