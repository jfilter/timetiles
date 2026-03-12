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

import { usePreviewValidationQuery } from "@/lib/hooks/use-preview-validation-query";
import type { ImportTransform } from "@/lib/types/import-transforms";
import type { FieldMapping, SheetInfo, SheetMapping, UrlAuthConfig } from "@/lib/types/import-wizard";

import { clearStorage, loadFromStorage, saveToStorage } from "./use-wizard-storage";
import {
  type CatalogSelection,
  initialState,
  type ScheduleConfig,
  STEP_TITLES,
  type WizardAction,
  wizardReducer,
  type WizardState,
  type WizardStep,
} from "./wizard-reducer";

// Re-export types so index.ts doesn't need to change
export type { CatalogSelection, ScheduleConfig, WizardState, WizardStep };

// Context
interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  // Helper actions
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setAuth: (isAuthenticated: boolean, isEmailVerified: boolean, userId: number | null) => void;
  setFile: (file: WizardState["file"], sheets: SheetInfo[], previewId: string, sourceUrl?: string) => void;
  setSourceUrl: (sourceUrl: string | null, authConfig?: UrlAuthConfig | null) => void;
  setScheduleConfig: (config: ScheduleConfig | null) => void;
  clearFile: () => void;
  setCatalog: (catalogId: number | "new" | null, newCatalogName?: string) => void;
  setSheetMapping: (sheetIndex: number, mapping: Partial<SheetMapping>) => void;
  setFieldMapping: (sheetIndex: number, mapping: Partial<FieldMapping>) => void;
  setTransforms: (sheetIndex: number, transforms: ImportTransform[]) => void;
  setImportOptions: (options: {
    deduplicationStrategy?: WizardState["deduplicationStrategy"];
    geocodingEnabled?: boolean;
  }) => void;
  startProcessing: (importFileId: number, scheduledImportId?: number) => void;
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

const defaultNavigationConfig: NavigationConfig = { showBack: true, showNext: true };

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

      // Determine the restored step based on current auth state
      const getRestoredStep = (): WizardStep => {
        if (wasAuthenticatedOnStart) {
          return Math.max(saved.currentStep ?? 2, 2) as WizardStep;
        }
        if (!initialAuth?.isAuthenticated) {
          return 1;
        }
        return saved.currentStep ?? 1;
      };

      const restoredState = {
        ...saved,
        // Always use current auth state from server
        isAuthenticated: initialAuth?.isAuthenticated ?? false,
        isEmailVerified: initialAuth?.isEmailVerified ?? false,
        userId: initialAuth?.userId ?? null,
        // startedAuthenticated is based on initial page load, not restored state
        startedAuthenticated: wasAuthenticatedOnStart ?? false,
        // Adjust step based on current auth state
        currentStep: getRestoredStep(),
      };
      dispatch({ type: "RESTORE", state: restoredState });
    }
  }, [initialAuth?.isAuthenticated, initialAuth?.isEmailVerified, initialAuth?.userId, wasAuthenticatedOnStart]);

  // Validate preview file exists when we have a previewId
  // If preview is invalid (file deleted, expired), clear file state and go back to upload step
  // Skip validation during processing (step 6) since the preview is cleaned up after import starts
  const validationEnabled = state.currentStep !== 6 && state.importFileId === null;
  const { data: validationData } = usePreviewValidationQuery(state.previewId, validationEnabled);

  useEffect(() => {
    if (validationData && !validationData.valid) {
      // Preview file no longer exists - clear file state
      dispatch({ type: "CLEAR_FILE" });
      // If we were past the upload step, go back to it
      if (state.currentStep > 2) {
        const getTargetStep = (): WizardStep => {
          if (wasAuthenticatedOnStart) {
            return 2;
          }
          return state.currentStep > 1 ? 2 : 1;
        };
        dispatch({ type: "SET_STEP", step: getTargetStep() });
      }
      clearStorage();
    }
  }, [validationData, state.currentStep, wasAuthenticatedOnStart]);

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

  const setFile = useCallback(
    (file: WizardState["file"], sheets: SheetInfo[], previewId: string, sourceUrl?: string) => {
      dispatch({ type: "SET_FILE", file, sheets, previewId, sourceUrl });
    },
    []
  );

  const setSourceUrl = useCallback((sourceUrl: string | null, authConfig?: UrlAuthConfig | null) => {
    dispatch({ type: "SET_SOURCE_URL", sourceUrl, authConfig });
  }, []);

  const setScheduleConfig = useCallback((config: ScheduleConfig | null) => {
    dispatch({ type: "SET_SCHEDULE_CONFIG", scheduleConfig: config });
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

  const setTransforms = useCallback((sheetIndex: number, transforms: ImportTransform[]) => {
    dispatch({ type: "SET_TRANSFORMS", sheetIndex, transforms });
  }, []);

  const setImportOptions = useCallback(
    (options: { deduplicationStrategy?: WizardState["deduplicationStrategy"]; geocodingEnabled?: boolean }) => {
      dispatch({ type: "SET_IMPORT_OPTIONS", ...options });
    },
    []
  );

  const startProcessing = useCallback((importFileId: number, scheduledImportId?: number) => {
    dispatch({ type: "START_PROCESSING", importFileId, scheduledImportId });
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
      setSourceUrl,
      setScheduleConfig,
      clearFile,
      setCatalog,
      setSheetMapping,
      setFieldMapping,
      setTransforms,
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
      setSourceUrl,
      setScheduleConfig,
      clearFile,
      setCatalog,
      setSheetMapping,
      setFieldMapping,
      setTransforms,
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
