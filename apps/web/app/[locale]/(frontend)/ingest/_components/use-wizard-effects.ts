/**
 * React-specific side effects for the import wizard.
 *
 * Handles initialization from server-provided auth state and preview file
 * validation. These effects cannot live inside the Zustand store because
 * they depend on React hooks (useEffect, React Query).
 *
 * @module
 * @category Components
 */
"use client";

import { useEffect } from "react";

import { useAuthState } from "@/lib/hooks/use-auth-queries";
import { usePreviewValidationQuery } from "@/lib/hooks/use-preview-validation-query";

import { canProceedFromStep, getPreviewInvalidatedStep } from "./wizard-selectors";
import { useWizardPreviewValidationState, useWizardProceedState, useWizardStore } from "./wizard-store";

interface InitialAuth {
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  userId: number | null;
}

/**
 * Initialize the wizard store and run side effects.
 *
 * Must be called once in the layout component that wraps all wizard pages.
 */
export const useWizardEffects = (initialAuth: InitialAuth): void => {
  // Seeds startedAuthenticated and the initial step from the server-known session;
  // `initialize` is idempotent (gated by `_initialized`).
  useEffect(() => {
    useWizardStore.getState().initialize(initialAuth);
  }, [initialAuth]);

  // Validate that the preview file still exists. In edit mode, skip while previewId
  // is null (before the URL re-fetch).
  const { previewId, currentStep, startedAuthenticated, ingestFileId, editMode } = useWizardPreviewValidationState();
  const validationEnabled = currentStep !== 7 && ingestFileId === null && !(editMode && !previewId);
  const { data: validationData } = usePreviewValidationQuery(previewId, validationEnabled);

  // Forced session recovery: the server confirmed the preview file is gone (expired
  // on disk), so wizard state referring to it is stale and the user must re-upload.
  useEffect(() => {
    if (validationEnabled && validationData && !validationData.valid) {
      const store = useWizardStore.getState();
      store.unloadFile();
      if (currentStep > 2) {
        store.recoverFromInvalidPreview(getPreviewInvalidatedStep(currentStep, startedAuthenticated));
      }
      useWizardStore.persist.clearStorage();
    }
  }, [validationEnabled, validationData, currentStep, startedAuthenticated]);
};

/**
 * Compute whether the user can proceed from the current step.
 *
 * Combines wizard store state with live auth state from React Query.
 */
export const useWizardCanProceed = (): boolean => {
  const proceedState = useWizardProceedState();
  const { isAuthenticated, isEmailVerified } = useAuthState();

  // No cast: the slice must structurally satisfy ProceedState, so a field the selector
  // forgets is a compile error rather than an `undefined` that crashes at render time.
  return canProceedFromStep(proceedState, isAuthenticated, isEmailVerified);
};
