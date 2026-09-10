/**
 * Verifies recovery of restored wizard state after server-side preview validation.
 * @module
 * @category Tests
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ validation: undefined as { valid: boolean } | undefined }));
vi.mock("@/lib/hooks/use-preview-validation-query", () => ({
  usePreviewValidationQuery: () => ({ data: mocks.validation }),
}));
vi.mock("@/lib/hooks/use-auth-queries", () => ({ useAuthState: () => ({ isAuthenticated: true }) }));

import { useWizardEffects } from "@/app/[locale]/(frontend)/ingest/_components/use-wizard-effects";
import { initialState, useWizardStore } from "@/app/[locale]/(frontend)/ingest/_components/wizard-store";

const auth = { isAuthenticated: true, isEmailVerified: true, userId: 1 };

describe("wizard preview recovery", () => {
  beforeEach(() => {
    mocks.validation = undefined;
    useWizardStore.setState({
      ...initialState,
      _initialized: true,
      startedAuthenticated: true,
      currentStep: 4,
      previewId: "restored-preview",
      file: { name: "events.csv", size: 10, mimeType: "text/csv" },
    });
  });

  afterEach(() => {
    cleanup();
    useWizardStore.setState({ ...initialState, _initialized: false });
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns to upload and clears the persisted draft after an invalid preview", () => {
    mocks.validation = { valid: false };
    const clearStorage = vi.spyOn(useWizardStore.persist, "clearStorage");
    renderHook(() => useWizardEffects(auth));

    expect(useWizardStore.getState()).toMatchObject({ currentStep: 2, previewId: null, file: null });
    expect(clearStorage).toHaveBeenCalled();
  });

  it.each([undefined, { valid: true }])("retains the draft unless invalidity is confirmed (%j)", (validation) => {
    mocks.validation = validation;
    const clearStorage = vi.spyOn(useWizardStore.persist, "clearStorage");
    renderHook(() => useWizardEffects(auth));

    expect(useWizardStore.getState()).toMatchObject({ currentStep: 4, previewId: "restored-preview" });
    expect(clearStorage).not.toHaveBeenCalled();
  });

  it.each([{ currentStep: 7 as const }, { ingestFileId: 123 }])(
    "ignores cached invalidity after processing has started (%j)",
    (processing) => {
      useWizardStore.setState(processing);
      mocks.validation = { valid: false };
      const clearStorage = vi.spyOn(useWizardStore.persist, "clearStorage");
      renderHook(() => useWizardEffects(auth));

      expect(useWizardStore.getState()).toMatchObject({ ...processing, previewId: "restored-preview" });
      expect(clearStorage).not.toHaveBeenCalled();
    }
  );
});
