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

import { canProceedFromStep, getPreviewInvalidatedStep, getStepTitle } from "./wizard-selectors";
import { useWizardStore } from "./wizard-store";

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
  useEffect(() => {
    useWizardStore.getState().initialize(initialAuth);
  }, [initialAuth]);

  // 2. Validate preview file still exists (auto-resets on expiry)
  const previewId = useWizardStore((s) => s.previewId);
  const currentStep = useWizardStore((s) => s.currentStep);
  const startedAuthenticated = useWizardStore((s) => s.startedAuthenticated);
  const importFileId = useWizardStore((s) => s.importFileId);
  const validationEnabled = currentStep !== 6 && importFileId === null;
  const { data: validationData } = usePreviewValidationQuery(previewId, validationEnabled);

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
  const currentStep = useWizardStore((s) => s.currentStep);
  const file = useWizardStore((s) => s.file);
  const sheets = useWizardStore((s) => s.sheets);
  const selectedCatalogId = useWizardStore((s) => s.selectedCatalogId);
  const sheetMappings = useWizardStore((s) => s.sheetMappings);
  const fieldMappings = useWizardStore((s) => s.fieldMappings);
  const { isAuthenticated, isEmailVerified } = useAuthState();

  return canProceedFromStep(
    { currentStep, file, sheets, selectedCatalogId, sheetMappings, fieldMappings } as Parameters<
      typeof canProceedFromStep
    >[0],
    isAuthenticated,
    isEmailVerified
  );
};

/**
 * Get the display title for the current wizard step.
 */
export const useWizardStepTitle = (): string => {
  const currentStep = useWizardStore((s) => s.currentStep);
  return getStepTitle(currentStep);
};
