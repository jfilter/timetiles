/**
 * Tests for the wizard's step gates.
 *
 * Two of these lock in validation that used to be missing entirely — a blank "create new
 * catalog" name and an empty cron expression both let the user walk to "Start Import", where
 * the request failed AFTER the ingest file had been created and the import had started.
 *
 * The `useWizardProceedState` case guards the shape contract: the hook passes a store SLICE,
 * and when that slice omitted a field the gate reads, `newCatalogName.trim()` threw and
 * crashed step 3 for every user with no catalogs.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import type { ProceedState } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-selectors";
import { canProceedFromStep } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-selectors";

const baseState: ProceedState = {
  currentStep: 3,
  file: { name: "events.csv", size: 10, mimeType: "text/csv" },
  sheets: [],
  selectedCatalogId: 1,
  newCatalogName: "",
  sheetMappings: [{ sheetIndex: 0, datasetId: 5, newDatasetName: "" }],
  fieldMappings: [],
  scheduleConfig: null,
};

const at = (overrides: Partial<ProceedState>): ProceedState => ({ ...baseState, ...overrides });

describe("canProceedFromStep", () => {
  describe("step 3 — catalog and dataset selection", () => {
    it("allows continuing with an existing catalog", () => {
      expect(canProceedFromStep(baseState, true, true)).toBe(true);
    });

    it("blocks a new catalog with no name", () => {
      expect(canProceedFromStep(at({ selectedCatalogId: "new", newCatalogName: "" }), true, true)).toBe(false);
    });

    it("blocks a new catalog whose name is only whitespace", () => {
      // " " is truthy, so a truthiness guard would create a catalog named " ".
      expect(canProceedFromStep(at({ selectedCatalogId: "new", newCatalogName: "   " }), true, true)).toBe(false);
    });

    it("allows a new catalog with a real name", () => {
      expect(canProceedFromStep(at({ selectedCatalogId: "new", newCatalogName: "Events" }), true, true)).toBe(true);
    });

    it("blocks a new dataset with no name", () => {
      const sheetMappings = [{ sheetIndex: 0, datasetId: "new" as const, newDatasetName: "  " }];
      expect(canProceedFromStep(at({ sheetMappings }), true, true)).toBe(false);
    });
  });

  describe("step 5 — schedule", () => {
    const step5 = (scheduleConfig: ProceedState["scheduleConfig"]) => at({ currentStep: 5, scheduleConfig });

    it("allows a one-time import", () => {
      expect(canProceedFromStep(step5(null), true, true)).toBe(true);
    });

    it("blocks a cron schedule with an empty expression", () => {
      // Submitting would create the ingest file and START the import before the schedule
      // fails validation: an error for a running import, and a retry hits "preview not found".
      const config = { enabled: true, scheduleType: "cron", cronExpression: "" } as ProceedState["scheduleConfig"];
      expect(canProceedFromStep(step5(config), true, true)).toBe(false);
    });

    it("allows a cron schedule with an expression", () => {
      const config = {
        enabled: true,
        scheduleType: "cron",
        cronExpression: "0 3 * * *",
      } as ProceedState["scheduleConfig"];
      expect(canProceedFromStep(step5(config), true, true)).toBe(true);
    });

    it("allows a frequency schedule, which needs no expression", () => {
      const config = { enabled: true, scheduleType: "frequency", frequency: "daily" } as ProceedState["scheduleConfig"];
      expect(canProceedFromStep(step5(config), true, true)).toBe(true);
    });
  });

  it("does not throw when a field is absent, as an incomplete store slice would leave it", () => {
    // Regression: a slice missing `newCatalogName`/`scheduleConfig` must neither throw on
    // `.trim()` nor silently skip the step-5 gate, even if the types are bypassed at runtime.
    const partial = { ...baseState, selectedCatalogId: "new" as const };
    delete (partial as Partial<ProceedState>).newCatalogName;

    expect(() => canProceedFromStep(partial, true, true)).not.toThrow();
    expect(canProceedFromStep(partial, true, true)).toBe(false);
  });
});
