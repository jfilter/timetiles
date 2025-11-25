/**
 * Wizard context for managing import wizard state.
 *
 * Provides centralized state management for the multi-step import wizard
 * using React Context and useReducer. Includes localStorage persistence
 * for draft recovery.
 *
 * @module
 * @category Components
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";

// Constants
const STORAGE_KEY = "timetiles_import_wizard_draft";
const STORAGE_EXPIRY_HOURS = 24;

// Types
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface SheetInfo {
  index: number;
  name: string;
  rowCount: number;
  headers: string[];
  sampleData: Record<string, unknown>[];
}

export interface SheetMapping {
  sheetIndex: number;
  datasetId: number | "new";
  newDatasetName: string;
  similarityScore: number | null;
}

export interface FieldMapping {
  sheetIndex: number;
  titleField: string | null;
  descriptionField: string | null;
  dateField: string | null;
  endDateField: string | null;
  idField: string | null;
  idStrategy: "external" | "computed" | "auto" | "hybrid";
  locationField: string | null;
  latitudeField: string | null;
  longitudeField: string | null;
}

export type CatalogSelection = number | "new" | null;

export interface WizardState {
  // Navigation
  currentStep: WizardStep;

  // Step 1: Auth
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  userId: number | null;

  // Step 2: Upload
  previewId: string | null;
  file: { name: string; size: number; mimeType: string } | null;
  sheets: SheetInfo[];

  // Step 3: Dataset Selection
  selectedCatalogId: CatalogSelection;
  newCatalogName: string;
  sheetMappings: SheetMapping[];

  // Step 4: Field Mapping
  fieldMappings: FieldMapping[];

  // Step 5: Review
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;

  // Step 6: Processing
  importFileId: number | null;
  isProcessing: boolean;
  error: string | null;

  // Meta
  lastSavedAt: string | null;
}

// Initial state
const initialState: WizardState = {
  currentStep: 1,
  isAuthenticated: false,
  isEmailVerified: false,
  userId: null,
  previewId: null,
  file: null,
  sheets: [],
  selectedCatalogId: null,
  newCatalogName: "",
  sheetMappings: [],
  fieldMappings: [],
  deduplicationStrategy: "skip",
  geocodingEnabled: true,
  importFileId: null,
  isProcessing: false,
  error: null,
  lastSavedAt: null,
};

// Action types
type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_AUTH"; isAuthenticated: boolean; isEmailVerified: boolean; userId: number | null }
  | { type: "SET_FILE"; file: WizardState["file"]; sheets: SheetInfo[]; previewId: string }
  | { type: "CLEAR_FILE" }
  | { type: "SET_CATALOG"; catalogId: number | "new" | null; newCatalogName?: string }
  | { type: "SET_SHEET_MAPPING"; sheetIndex: number; mapping: Partial<SheetMapping> }
  | { type: "SET_SHEET_MAPPINGS"; mappings: SheetMapping[] }
  | { type: "SET_FIELD_MAPPING"; sheetIndex: number; mapping: Partial<FieldMapping> }
  | { type: "SET_FIELD_MAPPINGS"; mappings: FieldMapping[] }
  | {
      type: "SET_IMPORT_OPTIONS";
      deduplicationStrategy?: WizardState["deduplicationStrategy"];
      geocodingEnabled?: boolean;
    }
  | { type: "START_PROCESSING"; importFileId: number }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "COMPLETE" }
  | { type: "RESET" }
  | { type: "RESTORE"; state: Partial<WizardState> };

// Reducer
/* eslint-disable sonarjs/max-lines-per-function, complexity -- Complex reducer with many action types */
const wizardReducer = (state: WizardState, action: WizardAction): WizardState => {
  const newState = (() => {
    switch (action.type) {
      case "SET_STEP":
        return { ...state, currentStep: action.step };

      case "NEXT_STEP":
        return {
          ...state,
          currentStep: Math.min(state.currentStep + 1, 6) as WizardStep,
        };

      case "PREV_STEP":
        return {
          ...state,
          currentStep: Math.max(state.currentStep - 1, 1) as WizardStep,
        };

      case "SET_AUTH":
        return {
          ...state,
          isAuthenticated: action.isAuthenticated,
          isEmailVerified: action.isEmailVerified,
          userId: action.userId,
        };

      case "SET_FILE":
        return {
          ...state,
          file: action.file,
          sheets: action.sheets,
          previewId: action.previewId,
          // Initialize sheet mappings for each sheet
          sheetMappings: action.sheets.map((sheet) => ({
            sheetIndex: sheet.index,
            datasetId: "new" as const,
            newDatasetName: sheet.name,
            similarityScore: null,
          })),
          // Initialize field mappings for each sheet
          fieldMappings: action.sheets.map((sheet) => ({
            sheetIndex: sheet.index,
            titleField: null,
            descriptionField: null,
            dateField: null,
            endDateField: null,
            idField: null,
            idStrategy: "auto" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          })),
        };

      case "CLEAR_FILE":
        return {
          ...state,
          file: null,
          sheets: [],
          previewId: null,
          sheetMappings: [],
          fieldMappings: [],
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
          mappings[index] = {
            ...currentMapping,
            ...action.mapping,
            sheetIndex: currentMapping.sheetIndex,
          };
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
          mappings[index] = {
            ...currentMapping,
            ...action.mapping,
            sheetIndex: currentMapping.sheetIndex,
          };
        }
        return { ...state, fieldMappings: mappings };
      }

      case "SET_FIELD_MAPPINGS":
        return { ...state, fieldMappings: action.mappings };

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
          isProcessing: true,
          error: null,
        };

      case "SET_ERROR":
        return {
          ...state,
          error: action.error,
          isProcessing: false,
        };

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
/* eslint-enable sonarjs/max-lines-per-function, complexity */

// Context
interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  // Helper actions
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setAuth: (isAuthenticated: boolean, isEmailVerified: boolean, userId: number | null) => void;
  setFile: (file: WizardState["file"], sheets: SheetInfo[], previewId: string) => void;
  clearFile: () => void;
  setCatalog: (catalogId: number | "new" | null, newCatalogName?: string) => void;
  setSheetMapping: (sheetIndex: number, mapping: Partial<SheetMapping>) => void;
  setFieldMapping: (sheetIndex: number, mapping: Partial<FieldMapping>) => void;
  setImportOptions: (options: {
    deduplicationStrategy?: WizardState["deduplicationStrategy"];
    geocodingEnabled?: boolean;
  }) => void;
  startProcessing: (importFileId: number) => void;
  setError: (error: string | null) => void;
  complete: () => void;
  reset: () => void;
  // Computed
  canProceed: boolean;
  stepTitle: string;
}

const WizardContext = createContext<WizardContextValue | null>(null);

// Storage helpers
const saveToStorage = (state: WizardState) => {
  try {
    const data = {
      state,
      expiresAt: new Date(Date.now() + STORAGE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

const loadFromStorage = (): Partial<WizardState> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const expiresAt = new Date(data.expiresAt);

    if (expiresAt < new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data.state;
  } catch {
    return null;
  }
};

const clearStorage = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
};

// Step titles
const STEP_TITLES: Record<WizardStep, string> = {
  1: "Sign In",
  2: "Upload File",
  3: "Select Dataset",
  4: "Map Fields",
  5: "Review",
  6: "Processing",
};

// Provider
export interface WizardProviderProps {
  children: React.ReactNode;
  initialAuth?: { isAuthenticated: boolean; isEmailVerified: boolean; userId: number | null };
}

export const WizardProvider = ({ children, initialAuth }: Readonly<WizardProviderProps>) => {
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialState,
    isAuthenticated: initialAuth?.isAuthenticated ?? false,
    isEmailVerified: initialAuth?.isEmailVerified ?? false,
    userId: initialAuth?.userId ?? null,
    // Skip auth step if already authenticated and verified
    currentStep: initialAuth?.isAuthenticated && initialAuth?.isEmailVerified ? 2 : 1,
  });

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      dispatch({ type: "RESTORE", state: saved });
    }
  }, []);

  // Save to localStorage on state changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (state.currentStep < 6) {
        saveToStorage(state);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [state]);

  // Helper actions
  const goToStep = useCallback((step: WizardStep) => {
    dispatch({ type: "SET_STEP", step });
  }, []);

  const nextStep = useCallback(() => {
    dispatch({ type: "NEXT_STEP" });
  }, []);

  const prevStep = useCallback(() => {
    dispatch({ type: "PREV_STEP" });
  }, []);

  const setAuth = useCallback((isAuthenticated: boolean, isEmailVerified: boolean, userId: number | null) => {
    dispatch({ type: "SET_AUTH", isAuthenticated, isEmailVerified, userId });
  }, []);

  const setFile = useCallback((file: WizardState["file"], sheets: SheetInfo[], previewId: string) => {
    dispatch({ type: "SET_FILE", file, sheets, previewId });
  }, []);

  const clearFile = useCallback(() => {
    dispatch({ type: "CLEAR_FILE" });
  }, []);

  const setCatalog = useCallback((catalogId: number | "new" | null, newCatalogName?: string) => {
    dispatch({ type: "SET_CATALOG", catalogId, newCatalogName });
  }, []);

  const setSheetMapping = useCallback((sheetIndex: number, mapping: Partial<SheetMapping>) => {
    dispatch({ type: "SET_SHEET_MAPPING", sheetIndex, mapping });
  }, []);

  const setFieldMapping = useCallback((sheetIndex: number, mapping: Partial<FieldMapping>) => {
    dispatch({ type: "SET_FIELD_MAPPING", sheetIndex, mapping });
  }, []);

  const setImportOptions = useCallback(
    (options: { deduplicationStrategy?: WizardState["deduplicationStrategy"]; geocodingEnabled?: boolean }) => {
      dispatch({ type: "SET_IMPORT_OPTIONS", ...options });
    },
    []
  );

  const startProcessing = useCallback((importFileId: number) => {
    dispatch({ type: "START_PROCESSING", importFileId });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", error });
  }, []);

  const complete = useCallback(() => {
    clearStorage();
    dispatch({ type: "COMPLETE" });
  }, []);

  const reset = useCallback(() => {
    clearStorage();
    dispatch({ type: "RESET" });
  }, []);

  // Compute canProceed based on current step
  const canProceed = useMemo(() => {
    switch (state.currentStep) {
      case 1:
        return state.isAuthenticated && state.isEmailVerified;
      case 2:
        return state.file !== null && state.sheets.length > 0;
      case 3:
        // datasetId is always number | "new", so we just check if catalog is selected
        return state.selectedCatalogId !== null && state.sheetMappings.length > 0;
      case 4:
        return state.fieldMappings.every(
          (m) =>
            m.titleField !== null &&
            m.dateField !== null &&
            (m.locationField !== null || (m.latitudeField !== null && m.longitudeField !== null))
        );
      case 5:
        return true;
      case 6:
        return false;
      default:
        return false;
    }
  }, [state]);

  const stepTitle = STEP_TITLES[state.currentStep];

  const value = useMemo(
    () => ({
      state,
      dispatch,
      goToStep,
      nextStep,
      prevStep,
      setAuth,
      setFile,
      clearFile,
      setCatalog,
      setSheetMapping,
      setFieldMapping,
      setImportOptions,
      startProcessing,
      setError,
      complete,
      reset,
      canProceed,
      stepTitle,
    }),
    [
      state,
      goToStep,
      nextStep,
      prevStep,
      setAuth,
      setFile,
      clearFile,
      setCatalog,
      setSheetMapping,
      setFieldMapping,
      setImportOptions,
      startProcessing,
      setError,
      complete,
      reset,
      canProceed,
      stepTitle,
    ]
  );

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
};

// Hook
export const useWizard = () => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
};
