/**
 * Transfers field mapping data between the flow editor and import wizard
 * via sessionStorage, avoiding URL length limits.
 *
 * @module
 * @category Utils
 */
import type { ImportTransform } from "../types/import-transforms";
import type { FieldMapping } from "../types/import-wizard";

const STORAGE_PREFIX = "timetiles_mapping_";
const OUTGOING_KEY = "timetiles_wizard_to_flow";

/** Max age before a stored mapping is considered expired (5 minutes). */
const MAX_AGE_MS = 5 * 60 * 1000;

interface StoredMapping {
  fieldMapping: FieldMapping;
  transforms: ImportTransform[];
  storedAt: number;
}

/**
 * Store mapping data in sessionStorage and return a short key.
 */
export const storeMappingData = (data: { fieldMapping: FieldMapping; transforms: ImportTransform[] }): string => {
  if (typeof window === "undefined") {
    throw new Error("storeMappingData can only be called in the browser");
  }
  const key = `${STORAGE_PREFIX}${Date.now()}`;
  const entry: StoredMapping = { ...data, storedAt: Date.now() };
  sessionStorage.setItem(key, JSON.stringify(entry));
  return key;
};

/**
 * Retrieve and delete mapping data from sessionStorage (one-shot).
 * Returns null if the key is missing, expired, or invalid.
 */
export const retrieveMappingData = (
  key: string
): { fieldMapping: FieldMapping; transforms: ImportTransform[] } | null => {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(key);
  if (!raw) return null;

  // Remove immediately so it's single-use
  sessionStorage.removeItem(key);

  try {
    const entry = JSON.parse(raw) as StoredMapping;
    if (Date.now() - entry.storedAt > MAX_AGE_MS) return null;
    return { fieldMapping: entry.fieldMapping, transforms: entry.transforms };
  } catch {
    return null;
  }
};

/**
 * Store wizard state (transforms + field mapping) for the flow editor to read on init.
 * Unlike the one-shot return mechanism, this is forward: wizard → flow editor.
 */
export const storeWizardStateForFlowEditor = (data: {
  fieldMapping: FieldMapping;
  transforms: ImportTransform[];
}): void => {
  if (typeof window === "undefined") return;
  const entry: StoredMapping = { ...data, storedAt: Date.now() };
  sessionStorage.setItem(OUTGOING_KEY, JSON.stringify(entry));
};

/**
 * Retrieve and delete wizard state stored for the flow editor (one-shot).
 */
export const retrieveWizardStateForFlowEditor = (): {
  fieldMapping: FieldMapping;
  transforms: ImportTransform[];
} | null => {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(OUTGOING_KEY);
  if (!raw) return null;

  sessionStorage.removeItem(OUTGOING_KEY);

  try {
    const entry = JSON.parse(raw) as StoredMapping;
    if (Date.now() - entry.storedAt > MAX_AGE_MS) return null;
    return { fieldMapping: entry.fieldMapping, transforms: entry.transforms };
  } catch {
    return null;
  }
};
