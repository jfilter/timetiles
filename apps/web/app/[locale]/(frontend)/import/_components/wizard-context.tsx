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

/*
 * THREE-LAYER PERSISTENCE ARCHITECTURE
 *
 * The wizard persists state across three independent channels, each serving a
 * distinct purpose:
 *
 * 1. localStorage (24h TTL, debounced 500ms)
 *    Draft recovery after browser crash or accidental navigation away. Saves
 *    the full wizard state so users don't lose work.
 *    - Auth state is NEVER restored from localStorage to prevent cached
 *      `isAuthenticated: true` surviving across accounts after logout.
 *    - State is NOT saved during step 6 (processing) to avoid persisting
 *      transient processing state.
 *
 * 2. sessionStorage (5min TTL, one-shot)
 *    Transfers field-mapping JSON from the flow editor back to the wizard.
 *    The payload is too large for URL params. Retrieved once on mount and
 *    immediately deleted to prevent stale re-reads.
 *
 * 3. URL params (?step=N&mappingKey=KEY)
 *    Coordinates flow-editor -> wizard return. Tells the wizard which step
 *    to jump to and which sessionStorage key holds the mapping data.
 *    Cleaned up immediately after reading to prevent re-application on
 *    subsequent re-renders.
 *
 * Other key design decisions:
 * - `startedAuthenticated` flag prevents hiding the auth step when a user
 *   logs out mid-import.
 * - Preview validation continuously checks if the uploaded file still exists
 *   (files are auto-deleted after 24h); resets to step 2 if the file is gone.
 */
"use client";

import { createContext, useContext, useEffect, useReducer } from "react";

import { useAuthState } from "@/lib/hooks/use-auth-mutations";
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
  // Computed
  canProceed: boolean;
  stepTitle: string;
}

const WizardContext = createContext<WizardContextValue | null>(null);

// Provider
export interface WizardProviderProps {
  children: React.ReactNode;
  initialAuth?: { isAuthenticated: boolean; isEmailVerified: boolean; userId: number | null };
}

export const WizardProvider = ({ children, initialAuth }: Readonly<WizardProviderProps>) => {
  const wasAuthenticatedOnStart = initialAuth?.isAuthenticated && initialAuth?.isEmailVerified;
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialState,
    // Track if user was already authenticated when wizard started
    startedAuthenticated: wasAuthenticatedOnStart ?? false,
    // Skip auth step if already authenticated and verified
    currentStep: wasAuthenticatedOnStart ? 2 : 1,
  });

  // Single source of truth for client-side auth state
  const { isAuthenticated, isEmailVerified } = useAuthState();

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
  const goToStep = (step: WizardStep) => {
    dispatch({ type: "SET_STEP", step });
  };

  const nextStep = () => {
    dispatch({ type: "NEXT_STEP" });
  };

  const prevStep = () => {
    dispatch({ type: "PREV_STEP" });
  };

  const setFile = (file: WizardState["file"], sheets: SheetInfo[], previewId: string, sourceUrl?: string) => {
    dispatch({ type: "SET_FILE", file, sheets, previewId, sourceUrl });
  };

  const setSourceUrl = (sourceUrl: string | null, authConfig?: UrlAuthConfig | null) => {
    dispatch({ type: "SET_SOURCE_URL", sourceUrl, authConfig });
  };

  const setScheduleConfig = (config: ScheduleConfig | null) => {
    dispatch({ type: "SET_SCHEDULE_CONFIG", scheduleConfig: config });
  };

  const clearFile = () => {
    dispatch({ type: "CLEAR_FILE" });
  };

  const setCatalog = (catalogId: number | "new" | null, newCatalogName?: string) => {
    dispatch({ type: "SET_CATALOG", catalogId, newCatalogName });
  };

  const setSheetMapping = (sheetIndex: number, mapping: Partial<SheetMapping>) => {
    dispatch({ type: "SET_SHEET_MAPPING", sheetIndex, mapping });
  };

  const setFieldMapping = (sheetIndex: number, mapping: Partial<FieldMapping>) => {
    dispatch({ type: "SET_FIELD_MAPPING", sheetIndex, mapping });
  };

  const setTransforms = (sheetIndex: number, transforms: ImportTransform[]) => {
    dispatch({ type: "SET_TRANSFORMS", sheetIndex, transforms });
  };

  const setImportOptions = (options: {
    deduplicationStrategy?: WizardState["deduplicationStrategy"];
    geocodingEnabled?: boolean;
  }) => {
    dispatch({ type: "SET_IMPORT_OPTIONS", ...options });
  };

  const startProcessing = (importFileId: number, scheduledImportId?: number) => {
    dispatch({ type: "START_PROCESSING", importFileId, scheduledImportId });
  };

  const setError = (error: string | null) => {
    dispatch({ type: "SET_ERROR", error });
  };

  const complete = () => {
    clearStorage();
    dispatch({ type: "COMPLETE" });
  };

  const reset = () => {
    clearStorage();
    dispatch({ type: "RESET" });
  };

  // Compute canProceed based on current step
  const canProceed = (() => {
    switch (state.currentStep) {
      case 1:
        return isAuthenticated && isEmailVerified;
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
  })();

  const stepTitle = STEP_TITLES[state.currentStep];

  const value = {
    state,
    dispatch,
    goToStep,
    nextStep,
    prevStep,
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
    canProceed,
    stepTitle,
  };

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
