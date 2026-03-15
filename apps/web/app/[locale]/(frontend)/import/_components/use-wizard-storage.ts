/**
 * LocalStorage helpers for import wizard draft persistence.
 *
 * Saves and restores wizard state with automatic expiry.
 *
 * @module
 * @category Components
 */
import type { WizardState } from "./wizard-reducer";

export const STORAGE_KEY = "timetiles_import_wizard_draft";
export const STORAGE_EXPIRY_HOURS = 24;

export const saveToStorage = (state: WizardState): void => {
  try {
    const data = { state, expiresAt: new Date(Date.now() + STORAGE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

export const loadFromStorage = (): Partial<WizardState> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const expiresAt = new Date(data.expiresAt);

    if (expiresAt < new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data.state;
  } catch {
    return null;
  }
};

export const clearStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
};
