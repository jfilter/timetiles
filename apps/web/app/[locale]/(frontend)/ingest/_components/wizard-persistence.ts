/**
 * localStorage persistence of the import wizard: what is saved, and when a
 * saved draft is too old to restore.
 *
 * @module
 * @category Components
 */
import type { PersistOptions } from "zustand/middleware";

import { MAX_STEP, type WizardState, type WizardStore } from "./wizard-state";

const STORAGE_KEY = "timetiles-wizard-v2";
const STORAGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const wizardPersistOptions: PersistOptions<WizardStore, Partial<WizardStore>> = {
  name: STORAGE_KEY,
  version: 1,
  partialize: (state) => {
    // Never persist auth credentials, internal flags, edit mode, or sensitive state
    const {
      startedAuthenticated,
      _initialized,
      _savedAt,
      authConfig,
      editMode,
      editScheduleId,
      editScheduleData,
      ...rest
    } = state;
    // Don't save during processing or in edit mode
    if (rest.currentStep === MAX_STEP || editMode) return {};
    return { ...rest, _savedAt: Date.now() };
  },
  merge: (persisted, current) => {
    if (!persisted || typeof persisted !== "object") return current;
    const p = persisted as Partial<WizardState> & { _savedAt?: number };
    // Check expiry
    if (p._savedAt && Date.now() - p._savedAt > STORAGE_EXPIRY_MS) {
      return current;
    }
    return { ...current, ...p };
  },
};
