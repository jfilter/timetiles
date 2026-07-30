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
/**
 * Exactly the state `canProceedFromStep` reads.
 *
 * Narrower than `WizardState` on purpose: the caller passes a store SLICE, and typing the
 * parameter as the full state forced an `as` cast that silently hid two missing fields —
 * `newCatalogName` was `undefined`, so `.trim()` threw and crashed step 3 for every user
 * with no catalogs, while `scheduleConfig` being `undefined` made the step-5 cron gate a
 * no-op. With this type the compiler catches the next omission.
 */
export type ProceedState = Pick<
  WizardState,
  | "currentStep"
  | "file"
  | "sheets"
  | "selectedCatalogId"
  | "newCatalogName"
  | "sheetMappings"
  | "fieldMappings"
  | "scheduleConfig"
>;

export const canProceedFromStep = (
  state: ProceedState,
  isAuthenticated: boolean,
  isEmailVerified: boolean
): boolean => {
  switch (state.currentStep) {
    case 1:
      return isAuthenticated && isEmailVerified;
    case 2:
      return state.file !== null && state.sheets.length > 0;
    case 3:
      return hasCompleteCatalogSelection(state);
    case 4:
      return state.fieldMappings.every(isFieldMappingComplete);
    case 5:
      return hasUsableSchedule(state);
    case 6:
      return false;
    default:
      return false;
  }
};

/**
 * A "create new" catalog or dataset needs a non-blank name.
 *
 * Without this the wizard let the user walk from step 3 to "Start Import" and only then fail
 * with an untranslated `New catalog name is required` — three steps from where it could be
 * corrected. A whitespace-only name was worse: it is truthy, so a catalog literally named
 * " " was created.
 */
const hasCompleteCatalogSelection = (state: ProceedState): boolean => {
  if (state.selectedCatalogId === null || state.sheetMappings.length === 0) return false;
  // `?? ""` is defence in depth: the types now guarantee the field is present, but reading it
  // off an incomplete store slice previously threw here and crashed the whole step.
  if (state.selectedCatalogId === "new" && (state.newCatalogName ?? "").trim() === "") return false;
  return state.sheetMappings.every((m) => m.datasetId !== "new" || (m.newDatasetName ?? "").trim() !== "");
};

/**
 * A cron schedule needs an expression.
 *
 * `DEFAULT_SCHEDULE_CONFIG` starts with an empty `cronExpression`, and step 5 had no gate at
 * all. Submitting created the ingest-file record and STARTED the import, then threw when the
 * scheduled-ingest failed validation — so the user saw a raw English error and believed the
 * import had failed while it was actually running. Retrying then failed with "preview not
 * found", because the preview was already cleaned up.
 */
const hasUsableSchedule = (state: ProceedState): boolean => {
  const config = state.scheduleConfig;
  if (!config?.enabled) return true;
  if (config.scheduleType !== "cron") return true;
  return (config.cronExpression ?? "").trim() !== "";
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
