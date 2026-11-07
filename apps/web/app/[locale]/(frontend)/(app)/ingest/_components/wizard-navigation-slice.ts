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

/** Empty wizard state for a session, starting at the first step the user may see. */
const freshState = (startedAuthenticated: boolean, draftOwnerId: number | null) => ({
  ...initialState,
  _initialized: true,
  startedAuthenticated,
  draftOwnerId,
  currentStep: (startedAuthenticated ? 2 : 1) as WizardStep,
});

export const createNavigationSlice: WizardSlice<WizardNavigationActions> = (set, get, api) => ({
  initialize: (auth) => {
    const wasAuthenticated = auth.isAuthenticated && auth.isEmailVerified;
    const { draftOwnerId, _initialized } = get();
    // A draft restored from localStorage that belongs to another user is never shown.
    if (draftOwnerId !== null && draftOwnerId !== auth.userId) {
      api.persist?.clearStorage();
      set(freshState(wasAuthenticated, auth.userId));
      return;
    }
    if (_initialized) return;
    // Keep a step persisted across a reload (localStorage rehydrates before this
    // runs). Authenticated users never land below step 2; unauthenticated users
    // always start at the auth step.
    const restoredStep = get().currentStep;
    const currentStep = (wasAuthenticated ? Math.max(restoredStep, 2) : 1) as WizardStep;
    set({ _initialized: true, startedAuthenticated: wasAuthenticated, currentStep, draftOwnerId: auth.userId });
  },

  claimDraft: (userId) => {
    const { draftOwnerId, startedAuthenticated } = get();
    if (draftOwnerId === userId) return;
    if (draftOwnerId === null) {
      set({ draftOwnerId: userId });
      return;
    }
    api.persist?.clearStorage();
    set(freshState(startedAuthenticated, userId));
  },

  initializeForEdit: (scheduleId, data) => {
    // Reset first to clear any previous wizard state; persist attaches no API without localStorage
    api.persist?.clearStorage();
    set({
      ...initialState,
      _initialized: true,
      editMode: true,
      editScheduleId: scheduleId,
      draftOwnerId: get().draftOwnerId,
      startedAuthenticated: true,
      currentStep: 2,
      sourceUrl: data.sourceUrl,
      authConfig: data.authConfig,
      jsonApiConfig: data.jsonApiConfig,
      selectedCatalogId: data.selectedCatalogId,
      scheduleConfig: data.scheduleConfig,
      editScheduleData: { datasetId: data.datasetId, datasetConfig: data.datasetConfig },
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
    // Carry the auth state and draft owner over: the layout's initialize() effect
    // only runs on mount, so a plain reset would drop a signed-in user onto the sign-in step.
    const { startedAuthenticated, draftOwnerId } = get();
    set(freshState(startedAuthenticated, draftOwnerId));
  },
});
