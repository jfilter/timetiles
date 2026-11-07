/**
 * Unit tests for wizard store edit mode functionality.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type EditScheduleData, initialState } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-state";
import { useWizardStore } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-store";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { SheetInfo } from "@/lib/ingest/types/wizard";

const noPath = { path: null, confidence: 0, confidenceLevel: "none" as const };

/** A re-fetched sheet whose auto-detection guesses `name` as title and `date` as timestamp. */
const refetchedSheet: SheetInfo = {
  index: 0,
  name: "Sheet1",
  rowCount: 1,
  headers: ["name", "headline", "date", "when"],
  sampleData: [{ name: "a", headline: "b", date: "2024-01-01", when: "2024-01-02" }],
  suggestedMappings: {
    language: { code: "eng", name: "English", confidence: 0.9, isReliable: true },
    mappings: {
      titlePath: { path: "name", confidence: 0.9, confidenceLevel: "high" },
      descriptionPath: noPath,
      locationNamePath: noPath,
      timestampPath: { path: "date", confidence: 0.9, confidenceLevel: "high" },
      endTimestampPath: noPath,
      latitudePath: noPath,
      longitudePath: noPath,
      locationPath: noPath,
    },
  },
};

const savedTransform: IngestTransform = {
  id: "t1",
  type: "rename",
  active: true,
  autoDetected: false,
  from: "headline",
  to: "title_text",
};

const editData: EditScheduleData = {
  sourceUrl: "https://example.com/data.csv",
  authConfig: { type: "bearer", bearerToken: "tok_123" },
  jsonApiConfig: null,
  selectedCatalogId: 7,
  datasetId: 42,
  datasetConfig: null,
  scheduleConfig: {
    enabled: true,
    name: "My Schedule",
    scheduleType: "frequency",
    frequency: "weekly",
    cronExpression: "",
    schemaMode: "strict",
  },
};

beforeEach(() => {
  // Mock persist.clearStorage since localStorage is not available in test environment
  if (useWizardStore.persist) {
    vi.spyOn(useWizardStore.persist, "clearStorage").mockImplementation(() => {});
  }
});

afterEach(() => {
  useWizardStore.setState({ ...initialState, _initialized: false, _savedAt: 0 });
  vi.restoreAllMocks();
});

describe("wizard store edit mode", () => {
  describe("initializeForEdit", () => {
    it("sets editMode and editScheduleId", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      const state = useWizardStore.getState();

      expect(state.editMode).toBe(true);
      expect(state.editScheduleId).toBe(42);
      expect(state._initialized).toBe(true);
    });

    it("sets currentStep to 2 and startedAuthenticated to true", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      const state = useWizardStore.getState();

      expect(state.currentStep).toBe(2);
      expect(state.startedAuthenticated).toBe(true);
    });

    it("pre-fills sourceUrl, authConfig, catalogId, scheduleConfig", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      const state = useWizardStore.getState();

      expect(state.sourceUrl).toBe("https://example.com/data.csv");
      expect(state.authConfig?.type).toBe("bearer");
      expect(state.authConfig?.bearerToken).toBe("tok_123");
      expect(state.selectedCatalogId).toBe(7);
      expect(state.scheduleConfig?.name).toBe("My Schedule");
      expect(state.scheduleConfig?.frequency).toBe("weekly");
      expect(state.scheduleConfig?.schemaMode).toBe("strict");
    });

    it("stores editScheduleData.datasetId so loadFile can pre-select it", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      const state = useWizardStore.getState();

      expect(state.editScheduleData?.datasetId).toBe(42);
    });

    it("does not pre-fill file, sheets, or previewId", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      const state = useWizardStore.getState();

      expect(state.file).toBeNull();
      expect(state.sheets).toEqual([]);
      expect(state.previewId).toBeNull();
    });

    it("resets previous wizard state before applying edit data", () => {
      // Simulate a previous wizard session
      useWizardStore.setState({
        currentStep: 4,
        file: { name: "old.csv", size: 100, mimeType: "text/csv" },
        ingestFileId: 99,
        error: "old error",
      });

      useWizardStore.getState().initializeForEdit(42, editData);
      const state = useWizardStore.getState();

      expect(state.file).toBeNull();
      expect(state.ingestFileId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("nextStep in edit mode", () => {
    it("caps at step 6 (skips processing step)", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      useWizardStore.setState({ currentStep: 6 });

      useWizardStore.getState().nextStep();
      expect(useWizardStore.getState().currentStep).toBe(6);
    });

    it("advances normally from step 2 to step 3", () => {
      useWizardStore.getState().initializeForEdit(42, editData);

      useWizardStore.getState().nextStep();
      expect(useWizardStore.getState().currentStep).toBe(3);
    });

    it("allows step 7 in normal mode", () => {
      useWizardStore.setState({ ...initialState, _initialized: true, currentStep: 6, sourceUrl: "http://x" });

      useWizardStore.getState().nextStep();
      expect(useWizardStore.getState().currentStep).toBe(7);
    });
  });

  describe("loadFile in edit mode", () => {
    const loadRefetch = () =>
      useWizardStore
        .getState()
        .loadFile({
          file: { name: "data.csv", size: 10, mimeType: "text/csv" },
          sheets: [refetchedSheet],
          previewId: "preview-1",
        });

    it("starts from the dataset's saved mapping, transforms and options instead of auto-detection", () => {
      useWizardStore
        .getState()
        .initializeForEdit(42, {
          ...editData,
          datasetConfig: {
            interpretationPlan: {
              ops: [savedTransform],
              columns: [],
              roles: { title: "title_text", timestamp: "when" },
              ambiguityResolution: "strict",
            },
            idStrategy: { type: "content-hash", duplicateStrategy: "update" },
            geocodingEnabled: false,
          },
        });

      loadRefetch();
      const state = useWizardStore.getState();

      expect(state.sheetMappings[0]?.datasetId).toBe(42);
      expect(state.fieldMappings[0]).toMatchObject({ titleField: "title_text", dateField: "when" });
      expect(state.transforms).toEqual({ 0: [savedTransform] });
      expect(state.deduplicationStrategy).toBe("update");
      expect(state.geocodingEnabled).toBe(false);
    });

    it("falls back to auto-detection when the schedule has no saved dataset config", () => {
      useWizardStore.getState().initializeForEdit(42, editData);

      loadRefetch();
      const state = useWizardStore.getState();

      expect(state.fieldMappings[0]).toMatchObject({ titleField: "name", dateField: "date" });
      expect(state.transforms).toEqual({});
    });
  });

  describe("unloadFile in edit mode", () => {
    it("preserves sourceUrl, authConfig, jsonApiConfig, scheduleConfig", () => {
      useWizardStore.getState().initializeForEdit(42, editData);
      useWizardStore.setState({
        file: { name: "data.csv", size: 500, mimeType: "text/csv" },
        previewId: "preview-123",
      });

      useWizardStore.getState().unloadFile();
      const state = useWizardStore.getState();

      expect(state.file).toBeNull();
      expect(state.previewId).toBeNull();
      expect(state.sheets).toEqual([]);
      // These should be preserved in edit mode
      expect(state.sourceUrl).toBe("https://example.com/data.csv");
      expect(state.authConfig?.type).toBe("bearer");
      expect(state.scheduleConfig?.name).toBe("My Schedule");
    });

    it("clears everything in normal mode", () => {
      useWizardStore.setState({
        ...initialState,
        _initialized: true,
        sourceUrl: "https://example.com/data.csv",
        authConfig: { type: "bearer", bearerToken: "tok" },
        scheduleConfig: editData.scheduleConfig,
        file: { name: "data.csv", size: 500, mimeType: "text/csv" },
      });

      useWizardStore.getState().unloadFile();
      const state = useWizardStore.getState();

      expect(state.sourceUrl).toBeNull();
      expect(state.authConfig).toBeNull();
      expect(state.scheduleConfig).toBeNull();
    });
  });

  describe("editMode state exclusions", () => {
    it("excludes editMode and editScheduleId from state spread with initialState", () => {
      // Verify initialState defaults for edit fields
      expect(initialState.editMode).toBe(false);
      expect(initialState.editScheduleId).toBeNull();
    });
  });
});
