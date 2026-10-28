/**
 * Unit tests for what the import wizard writes to and restores from localStorage.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { wizardPersistOptions } from "@/app/[locale]/(frontend)/ingest/_components/wizard-persistence";
import { initialState, type WizardStore } from "@/app/[locale]/(frontend)/ingest/_components/wizard-state";
import { TEST_TOKENS } from "@/tests/constants/test-credentials";

const { partialize, merge } = wizardPersistOptions;
const DAY_MS = 24 * 60 * 60 * 1000;

const store = (overrides: Partial<WizardStore>): WizardStore =>
  ({ ...initialState, _initialized: true, _savedAt: 0, ...overrides }) as WizardStore;

describe("wizard persistence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never saves URL credentials or edit-mode state", () => {
    const saved = partialize!(
      store({ currentStep: 4, authConfig: { type: "bearer", bearerToken: TEST_TOKENS.generic }, sourceUrl: "x" })
    );

    expect(saved).not.toHaveProperty("authConfig");
    expect(saved).not.toHaveProperty("startedAuthenticated");
    expect(saved).toMatchObject({ currentStep: 4, sourceUrl: "x" });
  });

  it("saves nothing while processing or in edit mode", () => {
    expect(partialize!(store({ currentStep: 7 }))).toEqual({});
    expect(partialize!(store({ currentStep: 3, editMode: true }))).toEqual({});
  });

  it("restores a draft younger than a day and discards an older one", () => {
    vi.useFakeTimers({ now: 10 * DAY_MS });
    const current = store({});

    expect(merge!({ currentStep: 4, _savedAt: 10 * DAY_MS - DAY_MS + 1 }, current).currentStep).toBe(4);
    expect(merge!({ currentStep: 4, _savedAt: 10 * DAY_MS - DAY_MS - 1 }, current)).toBe(current);
  });
});
