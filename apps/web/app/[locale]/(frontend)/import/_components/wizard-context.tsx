/**
 * Wizard context for managing import wizard state.
 *
 * Provides centralized state management for the multi-step import wizard
 * using React Context and useReducer. Persistence (localStorage save/restore,
 * preview validation) is delegated to {@link useWizardPersistence}. Pure
 * computed values are delegated to {@link canProceedFromStep} and
 * {@link getStepTitle} in `wizard-selectors.ts`.
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

import { createContext, useCallback, useContext, useMemo, useReducer } from "react";

import { useAuthState } from "@/lib/hooks/use-auth-queries";
import type { ImportTransform } from "@/lib/types/import-transforms";
import type { FieldMapping, SheetInfo, SheetMapping, UrlAuthConfig } from "@/lib/types/import-wizard";

import { useWizardPersistence } from "./use-wizard-persistence";
import { clearStorage } from "./use-wizard-storage";
import {
  type CatalogSelection,
  initialState,
  type ScheduleConfig,
  type WizardAction,
  wizardReducer,
  type WizardState,
  type WizardStep,
} from "./wizard-reducer";
import { canProceedFromStep, getStepTitle, shouldAutoAdvance as shouldAutoAdvanceSelector } from "./wizard-selectors";

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
  shouldAutoAdvance: boolean;
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
    startedAuthenticated: wasAuthenticatedOnStart ?? false,
    currentStep: wasAuthenticatedOnStart ? 2 : 1,
  });

  // Single source of truth for client-side auth state
  const { isAuthenticated, isEmailVerified } = useAuthState();

  // Persistence: localStorage save/restore + preview file validation
  useWizardPersistence({
    state,
    dispatch,
    wasAuthenticatedOnStart: wasAuthenticatedOnStart ?? false,
    wasAuthenticatedAtPageLoad: initialAuth?.isAuthenticated ?? false,
  });

  // Helper actions (thin dispatch wrappers, memoized to prevent child rerenders)
  const goToStep = useCallback((step: WizardStep) => dispatch({ type: "SET_STEP", step }), [dispatch]);
  const nextStep = useCallback(() => dispatch({ type: "NEXT_STEP" }), [dispatch]);
  const prevStep = useCallback(() => dispatch({ type: "PREV_STEP" }), [dispatch]);

  const setFile = useCallback(
    (file: WizardState["file"], sheets: SheetInfo[], previewId: string, sourceUrl?: string) => {
      dispatch({ type: "SET_FILE", file, sheets, previewId, sourceUrl });
    },
    [dispatch]
  );

  const setSourceUrl = useCallback(
    (sourceUrl: string | null, authConfig?: UrlAuthConfig | null) => {
      dispatch({ type: "SET_SOURCE_URL", sourceUrl, authConfig });
    },
    [dispatch]
  );

  const setScheduleConfig = useCallback(
    (config: ScheduleConfig | null) => {
      dispatch({ type: "SET_SCHEDULE_CONFIG", scheduleConfig: config });
    },
    [dispatch]
  );

  const clearFile = useCallback(() => dispatch({ type: "CLEAR_FILE" }), [dispatch]);

  const setCatalog = useCallback(
    (catalogId: number | "new" | null, newCatalogName?: string) => {
      dispatch({ type: "SET_CATALOG", catalogId, newCatalogName });
    },
    [dispatch]
  );

  const setSheetMapping = useCallback(
    (sheetIndex: number, mapping: Partial<SheetMapping>) => {
      dispatch({ type: "SET_SHEET_MAPPING", sheetIndex, mapping });
    },
    [dispatch]
  );

  const setFieldMapping = useCallback(
    (sheetIndex: number, mapping: Partial<FieldMapping>) => {
      dispatch({ type: "SET_FIELD_MAPPING", sheetIndex, mapping });
    },
    [dispatch]
  );

  const setTransforms = useCallback(
    (sheetIndex: number, transforms: ImportTransform[]) => {
      dispatch({ type: "SET_TRANSFORMS", sheetIndex, transforms });
    },
    [dispatch]
  );

  const setImportOptions = useCallback(
    (options: { deduplicationStrategy?: WizardState["deduplicationStrategy"]; geocodingEnabled?: boolean }) => {
      dispatch({ type: "SET_IMPORT_OPTIONS", ...options });
    },
    [dispatch]
  );

  const startProcessing = useCallback(
    (importFileId: number, scheduledImportId?: number) => {
      dispatch({ type: "START_PROCESSING", importFileId, scheduledImportId });
    },
    [dispatch]
  );

  const setError = useCallback((error: string | null) => dispatch({ type: "SET_ERROR", error }), [dispatch]);

  const complete = useCallback(() => {
    clearStorage();
    dispatch({ type: "COMPLETE" });
  }, [dispatch]);

  const reset = useCallback(() => {
    clearStorage();
    dispatch({ type: "RESET" });
  }, [dispatch]);

  // Computed values from pure selectors
  const canProceed = useMemo(
    () => canProceedFromStep(state, isAuthenticated, isEmailVerified),
    [state, isAuthenticated, isEmailVerified]
  );
  const shouldAutoAdvance = useMemo(
    () => shouldAutoAdvanceSelector(state, isAuthenticated, isEmailVerified),
    [state, isAuthenticated, isEmailVerified]
  );
  const stepTitle = useMemo(() => getStepTitle(state.currentStep), [state.currentStep]);

  const value = useMemo(
    () => ({
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
      shouldAutoAdvance,
      stepTitle,
    }),
    [
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
      shouldAutoAdvance,
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
