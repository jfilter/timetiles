/**
 * Pure selector functions for the import wizard.
 *
 * Extracts computed values from wizard state into testable, pure functions.
 * These selectors derive values from state without side effects.
 *
 * @module
 * @category Components
 */
import { isFieldMappingComplete } from "@/lib/types/import-wizard";

import { STEP_TITLES, type WizardState, type WizardStep } from "./wizard-reducer";

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
 * Get the display title for a wizard step.
 */
export const getStepTitle = (step: WizardStep): string => STEP_TITLES[step];

/**
 * Determine which step to restore to when loading saved state.
 *
 * @param savedStep - The step from saved state
 * @param wasAuthenticatedOnStart - Whether user was authenticated when wizard loaded
 * @param isCurrentlyAuthenticated - Whether user is currently authenticated
 */
export const getRestoredStep = (
  savedStep: WizardStep | undefined,
  wasAuthenticatedOnStart: boolean,
  isCurrentlyAuthenticated: boolean
): WizardStep => {
  if (wasAuthenticatedOnStart) {
    return Math.max(savedStep ?? 2, 2) as WizardStep;
  }
  if (!isCurrentlyAuthenticated) {
    return 1;
  }
  return savedStep ?? 1;
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
