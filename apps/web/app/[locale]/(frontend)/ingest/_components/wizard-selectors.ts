/**
 * Pure selector functions for the import wizard.
 *
 * Extracts computed values from wizard state into testable, pure functions.
 * These selectors derive values from state without side effects.
 *
 * @module
 * @category Components
 */
import { isFieldMappingComplete } from "@/lib/ingest/types/wizard";

import { type WizardState, type WizardStep } from "./wizard-store";

/**
 * Determine whether the user can proceed from the current wizard step.
 *
 * @param state - Current wizard state
 * @param isAuthenticated - Whether the user is currently authenticated
 * @param isEmailVerified - Whether the user's email is verified
 * @returns true if the user can proceed to the next step
 */
export const canProceedFromStep = (state: WizardState, isAuthenticated: boolean, isEmailVerified: boolean): boolean => {
  switch (state.currentStep) {
    case 1:
      return isAuthenticated && isEmailVerified;
    case 2:
      return state.file !== null && state.sheets.length > 0;
    case 3:
      return state.selectedCatalogId !== null && state.sheetMappings.length > 0;
    case 4:
      return state.fieldMappings.every(isFieldMappingComplete);
    case 5:
      return true;
    case 6:
      return false;
    default:
      return false;
  }
};

/**
 * Determine which step to go back to when a preview file is invalidated.
 *
 * @param currentStep - Current wizard step
 * @param wasAuthenticatedOnStart - Whether user was authenticated when wizard loaded
 */
export const getPreviewInvalidatedStep = (currentStep: WizardStep, wasAuthenticatedOnStart: boolean): WizardStep => {
  if (wasAuthenticatedOnStart) {
    return 2;
  }
  return currentStep > 1 ? 2 : 1;
};
