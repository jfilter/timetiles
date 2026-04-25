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
  // 1. Initialize store with server-provided auth (once)
  // Category A (UI initialization): seeds startedAuthenticated and the
  // initial step from server-known auth state. The data is the user's
  // own session, not a fuzzy server suggestion, and `initialize` is
  // idempotent (gated by `_initialized`). No user-facing config is
  // mutated.
  useEffect(() => {
    useWizardStore.getState().initialize(initialAuth);
  }, [initialAuth]);

  // 2. Validate preview file still exists (auto-resets on expiry)
  // In edit mode, skip validation when previewId is null (before URL re-fetch)
  const { previewId, currentStep, startedAuthenticated, ingestFileId, editMode } = useWizardPreviewValidationState();
  const validationEnabled = currentStep !== 7 && ingestFileId === null && !(editMode && !previewId);
  const { data: validationData } = usePreviewValidationQuery(previewId, validationEnabled);

  // Category B but safe: this is forced session recovery, not silent
  // auto-apply. The server has confirmed the preview file is gone (1h
  // expiry on disk), so any wizard state referring to it is stale and
  // the user must re-upload. There is no alternative UI path — the user
  // can't "Apply / Ignore" a missing file. Resetting to the upload step
  // is the only correct behaviour.
  useEffect(() => {
    if (validationData && !validationData.valid) {
      const store = useWizardStore.getState();
      store.clearFile();
      if (currentStep > 2) {
        store.goToStep(getPreviewInvalidatedStep(currentStep, startedAuthenticated));
      }
      useWizardStore.persist.clearStorage();
    }
  }, [validationData, currentStep, startedAuthenticated]);
};

/**
 * Compute whether the user can proceed from the current step.
 *
 * Combines wizard store state with live auth state from React Query.
 */
export const useWizardCanProceed = (): boolean => {
  const { currentStep, file, sheets, selectedCatalogId, sheetMappings, fieldMappings } = useWizardProceedState();
  const { isAuthenticated, isEmailVerified } = useAuthState();

  return canProceedFromStep(
    { currentStep, file, sheets, selectedCatalogId, sheetMappings, fieldMappings } as Parameters<
      typeof canProceedFromStep
    >[0],
    isAuthenticated,
    isEmailVerified
  );
};
