/**
 * Wizard state reducer for the import wizard.
 *
 * Contains the state types, initial state, action types, and reducer
 * function for managing import wizard state via useReducer.
 *
 * @module
 * @category Components
 */
import type { ImportTransform } from "@/lib/types/import-transforms";
import type { FieldMapping, SheetInfo, SheetMapping, UrlAuthConfig } from "@/lib/types/import-wizard";
import { humanizeFileName } from "@/lib/utils/humanize-file-name";

// Types
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type CatalogSelection = number | "new" | null;

/** Schedule configuration for creating scheduled imports */
export interface ScheduleConfig {
  enabled: boolean;
  name: string;
  scheduleType: "frequency" | "cron";
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression: string;
  schemaMode: "strict" | "additive" | "flexible";
}

export interface WizardState {
  // Navigation
  currentStep: WizardStep;

  /** Whether user was already authenticated when wizard started (used to hide auth step in UI) */
  startedAuthenticated: boolean;

  // Step 2: Upload
  previewId: string | null;
  file: { name: string; size: number; mimeType: string } | null;
  sheets: SheetInfo[];
  /** Source URL if data was fetched from URL instead of file upload */
  sourceUrl: string | null;
  /** Auth configuration for URL imports */
  authConfig: UrlAuthConfig | null;

  // Step 3: Dataset Selection
  selectedCatalogId: CatalogSelection;
  newCatalogName: string;
  sheetMappings: SheetMapping[];

  // Step 4: Field Mapping
  fieldMappings: FieldMapping[];
  transforms: Record<number, ImportTransform[]>;

  // Step 5: Review
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  /** Schedule configuration (only available if sourceUrl is set) */
  scheduleConfig: ScheduleConfig | null;

  // Step 6: Processing
  importFileId: number | null;
  /** ID of the created scheduled import (if schedule was created) */
  scheduledImportId: number | null;
  isProcessing: boolean;
  error: string | null;

  // Meta
  lastSavedAt: string | null;
}

// Initial state
export const initialState: WizardState = {
  currentStep: 1,
  startedAuthenticated: false,
  previewId: null,
  file: null,
  sheets: [],
  sourceUrl: null,
  authConfig: null,
  selectedCatalogId: null,
  newCatalogName: "",
  sheetMappings: [],
  fieldMappings: [],
  transforms: {},
  deduplicationStrategy: "skip",
  geocodingEnabled: true,
  scheduleConfig: null,
  importFileId: null,
  scheduledImportId: null,
  isProcessing: false,
  error: null,
  lastSavedAt: null,
};

// Action types
export type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_FILE"; file: WizardState["file"]; sheets: SheetInfo[]; previewId: string; sourceUrl?: string }
  | { type: "SET_SOURCE_URL"; sourceUrl: string | null; authConfig?: UrlAuthConfig | null }
  | { type: "SET_SCHEDULE_CONFIG"; scheduleConfig: ScheduleConfig | null }
  | { type: "CLEAR_FILE" }
  | { type: "SET_CATALOG"; catalogId: number | "new" | null; newCatalogName?: string }
  | { type: "SET_SHEET_MAPPING"; sheetIndex: number; mapping: Partial<SheetMapping> }
  | { type: "SET_SHEET_MAPPINGS"; mappings: SheetMapping[] }
  | { type: "SET_FIELD_MAPPING"; sheetIndex: number; mapping: Partial<FieldMapping> }
  | { type: "SET_FIELD_MAPPINGS"; mappings: FieldMapping[] }
  | { type: "SET_TRANSFORMS"; sheetIndex: number; transforms: ImportTransform[] }
  | {
      type: "SET_IMPORT_OPTIONS";
      deduplicationStrategy?: WizardState["deduplicationStrategy"];
      geocodingEnabled?: boolean;
    }
  | { type: "START_PROCESSING"; importFileId: number; scheduledImportId?: number }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "COMPLETE" }
  | { type: "RESET" }
  | { type: "RESTORE"; state: Partial<WizardState> };

// Step definitions — single source of truth for titles and labels
export const WIZARD_STEPS: ReadonlyArray<{ step: WizardStep; title: string; label: string; shortLabel: string }> = [
  { step: 1, title: "Sign In", label: "Sign In", shortLabel: "Auth" },
  { step: 2, title: "Upload File", label: "Upload", shortLabel: "Upload" },
  { step: 3, title: "Select Dataset", label: "Dataset", shortLabel: "Dataset" },
  { step: 4, title: "Map Fields", label: "Mapping", shortLabel: "Map" },
  { step: 5, title: "Review", label: "Review", shortLabel: "Review" },
  { step: 6, title: "Processing", label: "Import", shortLabel: "Import" },
];

export const STEP_TITLES: Record<WizardStep, string> = Object.fromEntries(
  WIZARD_STEPS.map((s) => [s.step, s.title])
) as Record<WizardStep, string>;

// Reducer
/* oxlint-disable complexity -- Complex reducer with many action types */
/* eslint-disable sonarjs/max-lines-per-function -- Complex reducer with many action types */
export const wizardReducer = (state: WizardState, action: WizardAction): WizardState => {
  const newState = (() => {
    switch (action.type) {
      case "SET_STEP":
        return { ...state, currentStep: action.step };

      case "NEXT_STEP":
        return { ...state, currentStep: Math.min(state.currentStep + 1, 6) as WizardStep };

      case "PREV_STEP":
        return { ...state, currentStep: Math.max(state.currentStep - 1, 1) as WizardStep };

      case "SET_FILE": {
        // For single-sheet files (like CSV), use the file name instead of "Sheet1"
        const getDatasetName = (sheet: SheetInfo) => {
          if (action.sheets.length === 1 && action.file?.name) {
            return humanizeFileName(action.file.name);
          }
          return sheet.name;
        };

        return {
          ...state,
          file: action.file,
          sheets: action.sheets,
          previewId: action.previewId,
          sourceUrl: action.sourceUrl ?? state.sourceUrl, // Preserve or update source URL
          // Initialize sheet mappings for each sheet
          sheetMappings: action.sheets.map((sheet) => ({
            sheetIndex: sheet.index,
            datasetId: "new" as const,
            newDatasetName: getDatasetName(sheet),
            similarityScore: null,
          })),
          // Initialize field mappings for each sheet, pre-filled from suggested mappings
          fieldMappings: action.sheets.map((sheet) => {
            const suggestions = sheet.suggestedMappings?.mappings;
            return {
              sheetIndex: sheet.index,
              // Pre-fill from auto-detected suggestions
              titleField: suggestions?.titlePath.path ?? null,
              descriptionField: suggestions?.descriptionPath.path ?? null,
              locationNameField: suggestions?.locationNamePath?.path ?? null,
              dateField: suggestions?.timestampPath.path ?? null,
              idField: null,
              idStrategy: "auto" as const,
              locationField: suggestions?.locationPath.path ?? null,
              latitudeField: suggestions?.latitudePath.path ?? null,
              longitudeField: suggestions?.longitudePath.path ?? null,
            };
          }),
        };
      }

      case "SET_SOURCE_URL":
        return { ...state, sourceUrl: action.sourceUrl, authConfig: action.authConfig ?? state.authConfig };

      case "SET_SCHEDULE_CONFIG":
        return { ...state, scheduleConfig: action.scheduleConfig };

      case "CLEAR_FILE":
        return {
          ...state,
          file: null,
          sheets: [],
          previewId: null,
          sourceUrl: null,
          authConfig: null,
          sheetMappings: [],
          fieldMappings: [],
          transforms: {},
          scheduleConfig: null,
        };

      case "SET_CATALOG":
        return {
          ...state,
          selectedCatalogId: action.catalogId,
          newCatalogName: action.newCatalogName ?? state.newCatalogName,
        };

      case "SET_SHEET_MAPPING": {
        const mappings = [...state.sheetMappings];
        const index = mappings.findIndex((m) => m.sheetIndex === action.sheetIndex);
        const currentMapping = mappings[index];
        if (index >= 0 && currentMapping) {
          mappings[index] = { ...currentMapping, ...action.mapping, sheetIndex: currentMapping.sheetIndex };
        }
        return { ...state, sheetMappings: mappings };
      }

      case "SET_SHEET_MAPPINGS":
        return { ...state, sheetMappings: action.mappings };

      case "SET_FIELD_MAPPING": {
        const mappings = [...state.fieldMappings];
        const index = mappings.findIndex((m) => m.sheetIndex === action.sheetIndex);
        const currentMapping = mappings[index];
        if (index >= 0 && currentMapping) {
          mappings[index] = { ...currentMapping, ...action.mapping, sheetIndex: currentMapping.sheetIndex };
        }
        return { ...state, fieldMappings: mappings };
      }

      case "SET_FIELD_MAPPINGS":
        return { ...state, fieldMappings: action.mappings };

      case "SET_TRANSFORMS":
        return { ...state, transforms: { ...state.transforms, [action.sheetIndex]: action.transforms } };

      case "SET_IMPORT_OPTIONS":
        return {
          ...state,
          deduplicationStrategy: action.deduplicationStrategy ?? state.deduplicationStrategy,
          geocodingEnabled: action.geocodingEnabled ?? state.geocodingEnabled,
        };

      case "START_PROCESSING":
        return {
          ...state,
          importFileId: action.importFileId,
          scheduledImportId: action.scheduledImportId ?? null,
          isProcessing: true,
          error: null,
        };

      case "SET_ERROR":
        return { ...state, error: action.error, isProcessing: false };

      case "COMPLETE":
        return { ...initialState };

      case "RESET":
        return { ...initialState };

      case "RESTORE":
        return { ...state, ...action.state };

      default:
        return state;
    }
  })();

  // Update lastSavedAt for persistence
  return { ...newState, lastSavedAt: new Date().toISOString() };
};
/* eslint-enable sonarjs/max-lines-per-function */
/* oxlint-enable complexity */
