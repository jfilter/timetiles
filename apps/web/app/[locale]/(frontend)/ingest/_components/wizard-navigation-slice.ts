/**
 * Wizard store slice for step navigation and the wizard lifecycle.
 *
 * @module
 * @category Components
 */
import {
  initialState,
  MAX_STEP,
  type WizardNavigationActions,
  type WizardSlice,
  type WizardStep,
} from "./wizard-state";

/** In edit mode, stop before the processing step. */
const EDIT_MAX_STEP = (MAX_STEP - 1) as WizardStep;

/** Step index for the schedule configuration. Skipped for file uploads (no URL). */
const SCHEDULE_STEP: WizardStep = 5;

/** Step index for the review screen (follows the schedule step). */
const REVIEW_STEP: WizardStep = 6;

/** Step index for field mapping (precedes the schedule step). */
const MAPPING_STEP: WizardStep = 4;

export const createNavigationSlice: WizardSlice<WizardNavigationActions> = (set, get, api) => ({
  initialize: (auth) => {
    if (get()._initialized) return;
    const wasAuthenticated = auth.isAuthenticated && auth.isEmailVerified;
    // Keep a persisted step from a reload (localStorage rehydrates
    // before this runs) — clobbering it dumped users back to step 2
    // with all their later-step data intact but unreachable without
    // re-clicking through. Authenticated users never land below step 2;
    // unauthenticated users always start at the auth step.
    const restoredStep = get().currentStep;
    const currentStep = (wasAuthenticated ? Math.max(restoredStep, 2) : 1) as WizardStep;
    set({ _initialized: true, startedAuthenticated: wasAuthenticated, currentStep });
  },

  initializeForEdit: (scheduleId, data) => {
    // Reset first to clear any previous wizard state; persist attaches no API without localStorage
    api.persist?.clearStorage();
    set({
      ...initialState,
      _initialized: true,
      editMode: true,
      editScheduleId: scheduleId,
      startedAuthenticated: true,
      currentStep: 2,
      sourceUrl: data.sourceUrl,
      authConfig: data.authConfig,
      jsonApiConfig: data.jsonApiConfig,
      selectedCatalogId: data.selectedCatalogId,
      scheduleConfig: data.scheduleConfig,
      editScheduleData: { datasetId: data.datasetId },
    });
  },

  recoverFromInvalidPreview: (targetStep) => set({ currentStep: targetStep }),

  nextStep: () =>
    set((s) => {
      const max = s.editMode ? EDIT_MAX_STEP : MAX_STEP;
      let next = Math.min(s.currentStep + 1, max) as WizardStep;
      // Skip Schedule step for file uploads (no URL = no schedule)
      if (next === SCHEDULE_STEP && !s.sourceUrl) next = REVIEW_STEP;
      return { currentStep: next };
    }),

  prevStep: () =>
    set((s) => {
      let prev = Math.max(s.currentStep - 1, 1) as WizardStep;
      // Skip Schedule step going back if no URL
      if (prev === SCHEDULE_STEP && !s.sourceUrl) prev = MAPPING_STEP;
      return { currentStep: prev };
    }),

  startProcessing: ({ ingestFileId, scheduledIngestId }) =>
    set({ ingestFileId, scheduledIngestId: scheduledIngestId ?? null, error: null }),

  setError: (error) => set({ error }),

  complete: () => {
    get().reset();
  },

  reset: () => {
    api.persist?.clearStorage();
    // Carry the auth state over instead of falling back to initialState:
    // the layout's initialize() effect only runs on mount, so a plain reset
    // dropped a signed-in user onto the sign-in step — with a 7-step progress
    // bar, because startedAuthenticated had been wiped too.
    const wasAuthenticated = get().startedAuthenticated;
    set({
      ...initialState,
      _initialized: true,
      startedAuthenticated: wasAuthenticated,
      currentStep: (wasAuthenticated ? 2 : 1) as WizardStep,
    });
  },
});
