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

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";

// Constants
const STORAGE_KEY = "timetiles_import_wizard_draft";
const STORAGE_EXPIRY_HOURS = 24;

// Types
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Confidence level for a field mapping suggestion
 */
export type ConfidenceLevel = "high" | "medium" | "low" | "none";

/**
 * A field mapping suggestion with confidence information
 */
export interface FieldMappingSuggestion {
  path: string | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Language detection result
 */
export interface LanguageDetection {
  code: string;
  name: string;
  confidence: number;
  isReliable: boolean;
}

/**
 * Suggested field mappings from auto-detection
 */
export interface SuggestedMappings {
  language: LanguageDetection;
  mappings: {
    titlePath: FieldMappingSuggestion;
    descriptionPath: FieldMappingSuggestion;
    locationNamePath: FieldMappingSuggestion;
    timestampPath: FieldMappingSuggestion;
    latitudePath: FieldMappingSuggestion;
    longitudePath: FieldMappingSuggestion;
    locationPath: FieldMappingSuggestion;
  };
}

export interface SheetInfo {
  index: number;
  name: string;
  rowCount: number;
  headers: string[];
  sampleData: Record<string, unknown>[];
  suggestedMappings?: SuggestedMappings;
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
  locationNameField: string | null;
  dateField: string | null;
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
  /** Whether user was already authenticated when wizard started (used to hide auth step in UI) */
  startedAuthenticated: boolean;

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
  startedAuthenticated: false,
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

      case "SET_FILE": {
        // For single-sheet files (like CSV), use the file name instead of "Sheet1"
        const getDatasetName = (sheet: SheetInfo) => {
          if (action.sheets.length === 1 && action.file?.name) {
            // Use file name without extension
            return action.file.name
              .replace(/\.[^/.]+$/, "")
              .replace(/[-_]+/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }
          return sheet.name;
        };

        return {
          ...state,
          file: action.file,
          sheets: action.sheets,
          previewId: action.previewId,
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
  // Navigation config (for layout to render navigation)
  navigationConfig: NavigationConfig;
  setNavigationConfig: (config: NavigationConfig) => void;
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

/**
 * Configuration for the wizard navigation buttons.
 * Steps can customize their navigation behavior via context.
 */
export interface NavigationConfig {
  /** Custom handler for the next button */
  onNext?: () => void | Promise<void>;
  /** Custom label for the next button */
  nextLabel?: string;
  /** Whether the next action is loading */
  isLoading?: boolean;
  /** Whether to show the back button (default: true) */
  showBack?: boolean;
  /** Whether to show the next button (default: true) */
  showNext?: boolean;
}

const defaultNavigationConfig: NavigationConfig = {
  showBack: true,
  showNext: true,
};

// Provider
export interface WizardProviderProps {
  children: React.ReactNode;
  initialAuth?: { isAuthenticated: boolean; isEmailVerified: boolean; userId: number | null };
}

export const WizardProvider = ({ children, initialAuth }: Readonly<WizardProviderProps>) => {
  const wasAuthenticatedOnStart = initialAuth?.isAuthenticated && initialAuth?.isEmailVerified;
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialState,
    isAuthenticated: initialAuth?.isAuthenticated ?? false,
    isEmailVerified: initialAuth?.isEmailVerified ?? false,
    userId: initialAuth?.userId ?? null,
    // Track if user was already authenticated when wizard started
    startedAuthenticated: wasAuthenticatedOnStart ?? false,
    // Skip auth step if already authenticated and verified
    currentStep: wasAuthenticatedOnStart ? 2 : 1,
  });

  // Navigation config state - steps can customize their navigation
  const [navigationConfig, setNavigationConfigState] = useState<NavigationConfig>(defaultNavigationConfig);

  // Wrapper that merges with defaults
  const setNavigationConfig = useCallback((config: NavigationConfig) => {
    setNavigationConfigState({ ...defaultNavigationConfig, ...config });
  }, []);

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      // Never restore auth state from localStorage - always use server-provided initialAuth
      // This prevents issues when user logs out but localStorage still has isAuthenticated: true
      const restoredState = {
        ...saved,
        // Always use current auth state from server
        isAuthenticated: initialAuth?.isAuthenticated ?? false,
        isEmailVerified: initialAuth?.isEmailVerified ?? false,
        userId: initialAuth?.userId ?? null,
        // startedAuthenticated is based on initial page load, not restored state
        startedAuthenticated: wasAuthenticatedOnStart ?? false,
        // Adjust step based on current auth state
        currentStep: (wasAuthenticatedOnStart
          ? Math.max(saved.currentStep, 2)
          : !initialAuth?.isAuthenticated
            ? 1
            : saved.currentStep) as WizardStep,
      };
      dispatch({ type: "RESTORE", state: restoredState });
    }
  }, [initialAuth?.isAuthenticated, initialAuth?.isEmailVerified, initialAuth?.userId, wasAuthenticatedOnStart]);

  // Validate preview file exists when we have a previewId
  // If preview is invalid (file deleted, expired), clear file state and go back to upload step
  // Skip validation during processing (step 6) since the preview is cleaned up after import starts
  useEffect(() => {
    const validatePreview = async () => {
      // Don't validate if no preview, during processing, or if import has started
      if (!state.previewId || state.currentStep === 6 || state.importFileId !== null) return;

      try {
        const response = await fetch(`/api/wizard/validate-preview?previewId=${state.previewId}`);
        const data = await response.json();

        if (!data.valid) {
          // Preview file no longer exists - clear file state
          dispatch({ type: "CLEAR_FILE" });
          // If we were past the upload step, go back to it
          if (state.currentStep > 2) {
            const targetStep = wasAuthenticatedOnStart ? 2 : Math.max(state.currentStep > 1 ? 2 : 1, 1);
            dispatch({ type: "SET_STEP", step: targetStep as WizardStep });
          }
          // Clear invalid state from storage
          clearStorage();
        }
      } catch {
        // Network error - don't clear state, let the user retry
      }
    };

    void validatePreview();
  }, [state.previewId, state.currentStep, state.importFileId, wasAuthenticatedOnStart]);

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
      navigationConfig,
      setNavigationConfig,
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
      navigationConfig,
      setNavigationConfig,
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
