/**
 * Wizard persistence hook for localStorage save/restore and preview validation.
 *
 * Separates side-effect-heavy persistence concerns from the wizard context
 * provider. Handles three responsibilities:
 * - Restoring saved state from localStorage on mount
 * - Debounced saving of state to localStorage on changes
 * - Validating that the preview file still exists (auto-resets on expiry)
 *
 * @module
 * @category Components
 */
"use client";

import { useEffect, useRef } from "react";

import { usePreviewValidationQuery } from "@/lib/hooks/use-preview-validation-query";

import { clearStorage, loadFromStorage, saveToStorage } from "./use-wizard-storage";
import type { WizardAction, WizardState } from "./wizard-reducer";
import { getPreviewInvalidatedStep, getRestoredStep } from "./wizard-selectors";

interface UseWizardPersistenceOptions {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  wasAuthenticatedOnStart: boolean;
  isCurrentlyAuthenticated: boolean;
}

/**
 * Manages localStorage persistence and preview file validation for the wizard.
 *
 * Call this inside the WizardProvider. It has three effects:
 * 1. On mount: restores saved state from localStorage
 * 2. On state change: debounced save to localStorage (except step 6)
 * 3. On preview invalidation: clears file state and navigates back to upload
 */
export const useWizardPersistence = ({
  state,
  dispatch,
  wasAuthenticatedOnStart,
  isCurrentlyAuthenticated,
}: UseWizardPersistenceOptions): void => {
  // 1. Restore from localStorage on mount (once only)
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = loadFromStorage();
    if (saved) {
      const restoredState = {
        ...saved,
        startedAuthenticated: wasAuthenticatedOnStart,
        currentStep: getRestoredStep(saved.currentStep, wasAuthenticatedOnStart, isCurrentlyAuthenticated),
      };
      dispatch({ type: "RESTORE", state: restoredState });
    }
  }, [dispatch, wasAuthenticatedOnStart, isCurrentlyAuthenticated]);

  // 2. Save to localStorage on state changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (state.currentStep < 6) {
        saveToStorage(state);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [state]);

  // 3. Validate preview file exists when we have a previewId
  const validationEnabled = state.currentStep !== 6 && state.importFileId === null;
  const { data: validationData } = usePreviewValidationQuery(state.previewId, validationEnabled);

  useEffect(() => {
    if (validationData && !validationData.valid) {
      dispatch({ type: "CLEAR_FILE" });
      if (state.currentStep > 2) {
        dispatch({ type: "SET_STEP", step: getPreviewInvalidatedStep(state.currentStep, wasAuthenticatedOnStart) });
      }
      clearStorage();
    }
  }, [validationData, state.currentStep, wasAuthenticatedOnStart, dispatch]);
};
