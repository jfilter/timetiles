/**
 * Unit tests for the wizard store state management.
 *
 * Tests the Zustand store actions for the import wizard.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ZustandMiddleware from "zustand/middleware";

import type { FieldMapping, SheetInfo } from "@/lib/ingest/types/wizard";

// Mock zustand/middleware so persist and devtools are no-op wrappers.
// This avoids localStorage/devtools dependencies in the test environment.
// The persist mock provides the `.persist` API (clearStorage, etc.) that
// the store's complete()/reset() actions rely on.
vi.mock("zustand/middleware", async (importOriginal) => {
  const actual = await importOriginal<typeof ZustandMiddleware>();
  return {
    ...actual,
    devtools: (fn: (...args: unknown[]) => unknown) => fn,
    persist: (fn: (...args: unknown[]) => unknown, _opts: unknown) => {
      type AnySet = (...args: unknown[]) => void;
      type AnyGet = () => unknown;
      type AnyApi = Record<string, unknown>;
      return (set: AnySet, get: AnyGet, api: AnyApi) => {
        api.persist = {
          clearStorage: () => {},
          rehydrate: () => Promise.resolve(),
          hasHydrated: () => true,
          onHydrate: () => () => {},
          onFinishHydration: () => () => {},
          getOptions: () => ({}),
          setOptions: () => {},
        };
        return fn(set, get, api);
      };
    },
  };
});

import {
  initialState,
  useWizardStore,
  type WizardState,
  type WizardStep,
} from "../../../app/[locale]/(frontend)/ingest/_components/wizard-store";

/** Reset the store to a known state before each test */
const resetStore = (overrides?: Partial<WizardState>) => {
  useWizardStore.setState({ ...initialState, _initialized: true, _savedAt: 0, ...overrides });
};

describe("Wizard Store", () => {
  // Note: beforeEach provides baseline reset, but each test also calls
  // resetStore() explicitly because Zustand setState in beforeEach can
  // be unreliable in non-isolated test environments.
  beforeEach(() => {
    resetStore();
  });

  describe("Navigation", () => {
    it("goToStep changes current step", () => {
      resetStore();
      useWizardStore.getState().goToStep(3);
      expect(useWizardStore.getState().currentStep).toBe(3);
    });

    it("nextStep increments step", () => {
      resetStore();
      useWizardStore.getState().nextStep();
      expect(useWizardStore.getState().currentStep).toBe(2);
    });

    it("nextStep does not exceed step 7", () => {
      resetStore({ currentStep: 7 as WizardStep });
      useWizardStore.getState().nextStep();
      expect(useWizardStore.getState().currentStep).toBe(7);
    });

    it("prevStep decrements step", () => {
      resetStore({ currentStep: 3 as WizardStep });
      useWizardStore.getState().prevStep();
      expect(useWizardStore.getState().currentStep).toBe(2);
    });

    it("prevStep does not go below step 1", () => {
      resetStore();
      useWizardStore.getState().prevStep();
      expect(useWizardStore.getState().currentStep).toBe(1);
    });
  });

  describe("Authentication", () => {
    it("startedAuthenticated is preserved in state", () => {
      resetStore({ startedAuthenticated: true });
      useWizardStore.getState().goToStep(2);
      expect(useWizardStore.getState().startedAuthenticated).toBe(true);
    });
  });

  describe("File Upload", () => {
    const mockFile = { name: "test.csv", size: 1024, mimeType: "text/csv" };
    const mockSheets: SheetInfo[] = [
      { index: 0, name: "Sheet1", rowCount: 100, headers: ["title", "date"], sampleData: [] },
      { index: 1, name: "Sheet2", rowCount: 50, headers: ["name", "location"], sampleData: [] },
    ];

    it("setFile sets file, sheets, and previewId", () => {
      resetStore();
      useWizardStore.getState().setFile(mockFile, mockSheets, "preview-123");

      const state = useWizardStore.getState();
      expect(state.file).toEqual(mockFile);
      expect(state.sheets).toEqual(mockSheets);
      expect(state.previewId).toBe("preview-123");
    });

    it("setFile initializes sheetMappings for each sheet", () => {
      resetStore();
      useWizardStore.getState().setFile(mockFile, mockSheets, "preview-123");

      const state = useWizardStore.getState();
      expect(state.sheetMappings).toHaveLength(2);
      expect(state.sheetMappings[0]).toEqual({
        sheetIndex: 0,
        datasetId: "new",
        newDatasetName: "Sheet1",
        similarityScore: null,
      });
      expect(state.sheetMappings[1]).toEqual({
        sheetIndex: 1,
        datasetId: "new",
        newDatasetName: "Sheet2",
        similarityScore: null,
      });
    });

    it("setFile initializes fieldMappings for each sheet", () => {
      resetStore();
      useWizardStore.getState().setFile(mockFile, mockSheets, "preview-123");

      const state = useWizardStore.getState();
      expect(state.fieldMappings).toHaveLength(2);
      expect(state.fieldMappings[0]?.sheetIndex).toBe(0);
      expect(state.fieldMappings[0]?.idStrategy).toBe("content-hash");
      expect(state.fieldMappings[1]?.sheetIndex).toBe(1);
    });

    it("clearFile resets file-related state", () => {
      resetStore({
        file: mockFile,
        sheets: mockSheets,
        previewId: "preview-123",
        sheetMappings: [{ sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null }],
        fieldMappings: [
          {
            sheetIndex: 0,
            titleField: "title",
            descriptionField: null,
            locationNameField: null,
            dateField: "date",
            endDateField: null,
            idField: null,
            idStrategy: "content-hash" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      });

      useWizardStore.getState().clearFile();

      const state = useWizardStore.getState();
      expect(state.file).toBeNull();
      expect(state.sheets).toHaveLength(0);
      expect(state.previewId).toBeNull();
      expect(state.sheetMappings).toHaveLength(0);
      expect(state.fieldMappings).toHaveLength(0);
    });
  });

  describe("Dataset Selection", () => {
    it("setCatalog sets catalog ID", () => {
      resetStore();
      useWizardStore.getState().setCatalog(42);

      expect(useWizardStore.getState().selectedCatalogId).toBe(42);
    });

    it("setCatalog sets new catalog name", () => {
      resetStore();
      useWizardStore.getState().setCatalog("new", "My New Catalog");

      const state = useWizardStore.getState();
      expect(state.selectedCatalogId).toBe("new");
      expect(state.newCatalogName).toBe("My New Catalog");
    });

    it("setSheetMapping updates specific sheet mapping", () => {
      resetStore({
        sheetMappings: [
          { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null },
          { sheetIndex: 1, datasetId: "new" as const, newDatasetName: "Sheet2", similarityScore: null },
        ],
      });

      useWizardStore.getState().setSheetMapping(0, { datasetId: 123, newDatasetName: "" });

      const state = useWizardStore.getState();
      expect(state.sheetMappings[0]?.datasetId).toBe(123);
      expect(state.sheetMappings[1]?.datasetId).toBe("new"); // Unchanged
    });

    describe("applySuggestionToDatasetSelection", () => {
      it("atomically sets catalog and per-sheet datasetId", () => {
        resetStore({
          sheetMappings: [
            { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null },
            { sheetIndex: 1, datasetId: "new" as const, newDatasetName: "Sheet2", similarityScore: null },
          ],
        });

        useWizardStore.getState().applySuggestionToDatasetSelection({
          catalogId: 42,
          sheetMatches: [
            { sheetIndex: 0, datasetId: 100 },
            { sheetIndex: 1, datasetId: 200 },
          ],
        });

        const state = useWizardStore.getState();
        expect(state.selectedCatalogId).toBe(42);
        expect(state.sheetMappings[0]?.datasetId).toBe(100);
        expect(state.sheetMappings[1]?.datasetId).toBe(200);
      });

      it("only updates sheets present in sheetMatches", () => {
        resetStore({
          sheetMappings: [
            { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null },
            { sheetIndex: 1, datasetId: "new" as const, newDatasetName: "Sheet2", similarityScore: null },
            { sheetIndex: 2, datasetId: "new" as const, newDatasetName: "Sheet3", similarityScore: null },
          ],
        });

        useWizardStore
          .getState()
          .applySuggestionToDatasetSelection({ catalogId: 7, sheetMatches: [{ sheetIndex: 1, datasetId: 50 }] });

        const state = useWizardStore.getState();
        expect(state.selectedCatalogId).toBe(7);
        expect(state.sheetMappings[0]?.datasetId).toBe("new"); // Unchanged
        expect(state.sheetMappings[1]?.datasetId).toBe(50);
        expect(state.sheetMappings[2]?.datasetId).toBe("new"); // Unchanged
      });

      it("optionally records similarityScore for matched sheets", () => {
        resetStore({
          sheetMappings: [
            { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null },
          ],
        });

        useWizardStore
          .getState()
          .applySuggestionToDatasetSelection({
            catalogId: 1,
            sheetMatches: [{ sheetIndex: 0, datasetId: 99, similarityScore: 0.85 }],
          });

        expect(useWizardStore.getState().sheetMappings[0]?.similarityScore).toBe(0.85);
      });

      it("performs the catalog + sheet update in a single store transaction", () => {
        // Subscribe to the store and capture every intermediate state — there
        // must be exactly one state where both the catalog AND sheet mappings
        // are updated together (no half-applied intermediate visible).
        resetStore({
          sheetMappings: [
            { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null },
          ],
        });

        const observed: Array<{ selectedCatalogId: unknown; firstDatasetId: unknown }> = [];
        const unsubscribe = useWizardStore.subscribe((state) => {
          observed.push({
            selectedCatalogId: state.selectedCatalogId,
            firstDatasetId: state.sheetMappings[0]?.datasetId,
          });
        });

        try {
          useWizardStore
            .getState()
            .applySuggestionToDatasetSelection({ catalogId: 42, sheetMatches: [{ sheetIndex: 0, datasetId: 7 }] });
        } finally {
          unsubscribe();
        }

        // Exactly one observed change, and it has both fields updated.
        expect(observed).toHaveLength(1);
        expect(observed[0]).toEqual({ selectedCatalogId: 42, firstDatasetId: 7 });
      });
    });
  });

  describe("Field Mapping", () => {
    it("setFieldMapping updates specific field mapping", () => {
      resetStore({
        fieldMappings: [
          {
            sheetIndex: 0,
            titleField: null,
            descriptionField: null,
            locationNameField: null,
            dateField: null,
            endDateField: null,
            idField: null,
            idStrategy: "content-hash" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      });

      useWizardStore
        .getState()
        .setFieldMapping(0, { titleField: "name", dateField: "created_at", locationField: "address" });

      const state = useWizardStore.getState();
      expect(state.fieldMappings[0]?.titleField).toBe("name");
      expect(state.fieldMappings[0]?.dateField).toBe("created_at");
      expect(state.fieldMappings[0]?.locationField).toBe("address");
      expect(state.fieldMappings[0]?.idStrategy).toBe("content-hash"); // Unchanged
    });

    it("setFieldMapping updates idStrategy", () => {
      resetStore({
        fieldMappings: [
          {
            sheetIndex: 0,
            titleField: null,
            descriptionField: null,
            locationNameField: null,
            dateField: null,
            endDateField: null,
            idField: null,
            idStrategy: "content-hash" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      });

      useWizardStore.getState().setFieldMapping(0, { idStrategy: "external", idField: "uuid" });

      const state = useWizardStore.getState();
      expect(state.fieldMappings[0]?.idStrategy).toBe("external");
      expect(state.fieldMappings[0]?.idField).toBe("uuid");
    });
  });

  describe("Import Options", () => {
    it("setImportOptions updates deduplication strategy", () => {
      resetStore();
      useWizardStore.getState().setImportOptions({ deduplicationStrategy: "update" });

      const state = useWizardStore.getState();
      expect(state.deduplicationStrategy).toBe("update");
      expect(state.geocodingEnabled).toBe(true); // Unchanged
    });

    it("setImportOptions updates geocoding toggle", () => {
      resetStore();
      useWizardStore.getState().setImportOptions({ geocodingEnabled: false });

      const state = useWizardStore.getState();
      expect(state.geocodingEnabled).toBe(false);
      expect(state.deduplicationStrategy).toBe("skip"); // Unchanged
    });

    it("setImportOptions updates both options", () => {
      resetStore();
      useWizardStore.getState().setImportOptions({ deduplicationStrategy: "version", geocodingEnabled: false });

      const state = useWizardStore.getState();
      expect(state.deduplicationStrategy).toBe("version");
      expect(state.geocodingEnabled).toBe(false);
    });
  });

  describe("Processing", () => {
    it("startProcessing sets processing state", () => {
      resetStore();
      useWizardStore.getState().startProcessing(456);

      const state = useWizardStore.getState();
      expect(state.ingestFileId).toBe(456);
      expect(state.error).toBeNull();
    });

    it("setError sets error", () => {
      resetStore();
      useWizardStore.getState().setError("Import failed: invalid data");

      expect(useWizardStore.getState().error).toBe("Import failed: invalid data");
    });

    it("setError clears error when null", () => {
      resetStore({ error: "Previous error" });
      useWizardStore.getState().setError(null);

      expect(useWizardStore.getState().error).toBeNull();
    });
  });

  describe("Reset", () => {
    it("complete resets to initial state", () => {
      resetStore({
        currentStep: 5 as WizardStep,
        file: { name: "test.csv", size: 1024, mimeType: "text/csv" },
        ingestFileId: 789,
      });

      useWizardStore.getState().complete();

      const state = useWizardStore.getState();
      expect(state.currentStep).toBe(1);
      expect(state.file).toBeNull();
      expect(state.ingestFileId).toBeNull();
    });

    it("reset resets to initial state", () => {
      resetStore({ currentStep: 3 as WizardStep, selectedCatalogId: 42, error: "Some error" });

      useWizardStore.getState().reset();

      const state = useWizardStore.getState();
      expect(state.currentStep).toBe(1);
      expect(state.selectedCatalogId).toBeNull();
      expect(state.error).toBeNull();
    });

    it("reset tolerates a missing persist API", () => {
      resetStore({ currentStep: 3 as WizardStep, selectedCatalogId: 42, error: "Some error" });

      const originalPersist = Reflect.get(useWizardStore, "persist");
      Reflect.set(useWizardStore, "persist", undefined);

      try {
        expect(() => useWizardStore.getState().reset()).not.toThrow();

        const state = useWizardStore.getState();
        expect(state.currentStep).toBe(1);
        expect(state.selectedCatalogId).toBeNull();
        expect(state.error).toBeNull();
      } finally {
        Reflect.set(useWizardStore, "persist", originalPersist);
      }
    });

    it("reset clears ALL state for a clean second import", () => {
      // Simulate a completed first import with all fields populated
      resetStore({
        currentStep: 6 as WizardStep,
        file: { name: "events.csv", size: 2048, mimeType: "text/csv" },
        sheets: [{ index: 0, name: "Sheet1", rowCount: 500, headers: ["title", "date", "location"], sampleData: [] }],
        previewId: "preview-abc",
        sourceUrl: "https://example.com/data.csv",
        selectedCatalogId: 42,
        newCatalogName: "My Catalog",
        sheetMappings: [{ sheetIndex: 0, datasetId: 99, newDatasetName: "My Dataset", similarityScore: 85 }],
        fieldMappings: [
          {
            sheetIndex: 0,
            titleField: "title",
            dateField: "date",
            endDateField: null,
            locationField: "location",
            descriptionField: null,
            locationNameField: null,
            idField: null,
            idStrategy: "external" as const,
            latitudeField: null,
            longitudeField: null,
          },
        ],
        transforms: { 0: [] },
        deduplicationStrategy: "update",
        geocodingEnabled: false,
        ingestFileId: 123,
        error: null,
      });

      useWizardStore.getState().reset();

      const state = useWizardStore.getState();

      // Verify every field is back to initial
      expect(state.currentStep).toBe(1);
      expect(state.file).toBeNull();
      expect(state.sheets).toHaveLength(0);
      expect(state.previewId).toBeNull();
      expect(state.sourceUrl).toBeNull();
      expect(state.selectedCatalogId).toBeNull();
      expect(state.newCatalogName).toBe("");
      expect(state.sheetMappings).toHaveLength(0);
      expect(state.fieldMappings).toHaveLength(0);
      expect(state.transforms).toEqual({});
      expect(state.deduplicationStrategy).toBe("skip");
      expect(state.geocodingEnabled).toBe(true);
      expect(state.ingestFileId).toBeNull();
      expect(state.error).toBeNull();
      expect(state.configSuggestions).toHaveLength(0);
    });

    it("second import after reset starts completely fresh", () => {
      // First import
      resetStore();
      const { setFile, setCatalog } = useWizardStore.getState();
      const sheets: SheetInfo[] = [
        { index: 0, name: "Sheet1", rowCount: 100, headers: ["title", "date"], sampleData: [] },
      ];
      setFile({ name: "first.csv", size: 1024, mimeType: "text/csv" }, sheets, "preview-1");
      setCatalog(42, "First Catalog");

      // Verify first import state
      expect(useWizardStore.getState().file?.name).toBe("first.csv");
      expect(useWizardStore.getState().selectedCatalogId).toBe(42);

      // Reset
      useWizardStore.getState().reset();

      // Second import — set a different file
      const sheets2: SheetInfo[] = [
        { index: 0, name: "Data", rowCount: 200, headers: ["name", "location"], sampleData: [] },
      ];
      useWizardStore.getState().setFile({ name: "second.csv", size: 2048, mimeType: "text/csv" }, sheets2, "preview-2");

      const state = useWizardStore.getState();

      // Verify second import has NO state from first import
      expect(state.file?.name).toBe("second.csv");
      expect(state.selectedCatalogId).toBeNull(); // NOT 42 from first import
      expect(state.newCatalogName).toBe(""); // NOT "First Catalog"
      expect(state.sheetMappings[0]?.newDatasetName).toBe("second"); // From filename, not "Sheet1"
      expect(state.previewId).toBe("preview-2");
    });
  });
});

/**
 * Tests for the canProceed validation logic.
 *
 * The canProceed function determines whether the user can advance
 * to the next step based on the current state. Each step has specific
 * requirements that must be met.
 */
describe("canProceed Validation", () => {
  // Helper function to compute canProceed (mirrors wizard-selectors.ts logic)
  // Auth state is now external (from useAuthState), so step 1 takes explicit booleans
  const computeCanProceed = (
    state: WizardState,
    auth: { isAuthenticated: boolean; isEmailVerified: boolean } = { isAuthenticated: false, isEmailVerified: false }
  ): boolean => {
    switch (state.currentStep) {
      case 1:
        return auth.isAuthenticated && auth.isEmailVerified;
      case 2:
        return state.file !== null && state.sheets.length > 0;
      case 3:
        return state.selectedCatalogId !== null && state.sheetMappings.length > 0;
      case 4:
        return state.fieldMappings.every(
          (m) =>
            m.titleField !== null &&
            m.dateField !== null &&
            (m.locationField !== null || (m.latitudeField !== null && m.longitudeField !== null))
        );
      case 5:
        return true;
      case 6:
        return false;
      default:
        return false;
    }
  };

  describe("Step 1: Authentication", () => {
    it("requires both authentication AND email verification", () => {
      const state = { ...initialState, currentStep: 1 as WizardStep };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks if only authenticated but not verified", () => {
      const state = { ...initialState, currentStep: 1 as WizardStep };
      expect(computeCanProceed(state, { isAuthenticated: true, isEmailVerified: false })).toBe(false);
    });

    it("blocks if only verified but not authenticated", () => {
      const state = { ...initialState, currentStep: 1 as WizardStep };
      expect(computeCanProceed(state, { isAuthenticated: false, isEmailVerified: true })).toBe(false);
    });

    it("allows proceeding when both authenticated and verified", () => {
      const state = { ...initialState, currentStep: 1 as WizardStep };
      expect(computeCanProceed(state, { isAuthenticated: true, isEmailVerified: true })).toBe(true);
    });
  });

  describe("Step 2: File Upload", () => {
    it("blocks with null file", () => {
      const state = { ...initialState, currentStep: 2 as WizardStep, file: null, sheets: [] };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks with file but empty sheets array", () => {
      const state = {
        ...initialState,
        currentStep: 2 as WizardStep,
        file: { name: "test.csv", size: 1024, mimeType: "text/csv" },
        sheets: [],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("allows proceeding with file and sheets", () => {
      const state = {
        ...initialState,
        currentStep: 2 as WizardStep,
        file: { name: "test.csv", size: 1024, mimeType: "text/csv" },
        sheets: [{ index: 0, name: "Sheet1", rowCount: 100, headers: ["title"], sampleData: [] }],
      };
      expect(computeCanProceed(state)).toBe(true);
    });
  });

  describe("Step 3: Dataset Selection", () => {
    it("blocks with null catalog selection", () => {
      const state = {
        ...initialState,
        currentStep: 3 as WizardStep,
        selectedCatalogId: null,
        sheetMappings: [{ sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Test", similarityScore: null }],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks with empty sheetMappings", () => {
      const state = { ...initialState, currentStep: 3 as WizardStep, selectedCatalogId: 1, sheetMappings: [] };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("allows proceeding with catalog and sheet mappings", () => {
      const state = {
        ...initialState,
        currentStep: 3 as WizardStep,
        selectedCatalogId: 1,
        sheetMappings: [{ sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Test", similarityScore: null }],
      };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("allows proceeding with 'new' catalog selection", () => {
      const state = {
        ...initialState,
        currentStep: 3 as WizardStep,
        selectedCatalogId: "new" as const,
        newCatalogName: "My New Catalog",
        sheetMappings: [{ sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Test", similarityScore: null }],
      };
      expect(computeCanProceed(state)).toBe(true);
    });
  });

  describe("Step 4: Field Mapping", () => {
    const baseFieldMapping: FieldMapping = {
      sheetIndex: 0,
      titleField: null,
      descriptionField: null,
      locationNameField: null,
      dateField: null,
      endDateField: null,
      idField: null,
      idStrategy: "content-hash",
      locationField: null,
      latitudeField: null,
      longitudeField: null,
    };

    it("blocks when missing titleField", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [{ ...baseFieldMapping, titleField: null, dateField: "date", locationField: "address" }],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks when missing dateField", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [{ ...baseFieldMapping, titleField: "name", dateField: null, locationField: "address" }],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks when missing all geo fields", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: "date",
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks when only latitude without longitude", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          { ...baseFieldMapping, titleField: "name", dateField: "date", latitudeField: "lat", longitudeField: null },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks when only longitude without latitude", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          { ...baseFieldMapping, titleField: "name", dateField: "date", latitudeField: null, longitudeField: "lng" },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("allows proceeding with locationField as geo requirement", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [{ ...baseFieldMapping, titleField: "name", dateField: "date", locationField: "address" }],
      };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("allows proceeding with lat+lng as geo requirement", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          { ...baseFieldMapping, titleField: "name", dateField: "date", latitudeField: "lat", longitudeField: "lng" },
        ],
      };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("allows both locationField and lat/lng (prefers either)", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: "date",
            locationField: "address",
            latitudeField: "lat",
            longitudeField: "lng",
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("requires all sheets to have valid mappings (multi-sheet)", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          { ...baseFieldMapping, sheetIndex: 0, titleField: "name", dateField: "date", locationField: "address" },
          {
            ...baseFieldMapping,
            sheetIndex: 1,
            titleField: null, // Missing title!
            dateField: "date",
            locationField: "place",
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("allows proceeding when all sheets have valid mappings", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          { ...baseFieldMapping, sheetIndex: 0, titleField: "name", dateField: "date", locationField: "address" },
          {
            ...baseFieldMapping,
            sheetIndex: 1,
            titleField: "event_name",
            dateField: "event_date",
            latitudeField: "lat",
            longitudeField: "lng",
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("allows proceeding with empty fieldMappings (edge case)", () => {
      // This is a valid edge case - if there are no sheets, all mappings are valid
      const state = { ...initialState, currentStep: 4 as WizardStep, fieldMappings: [] };
      // Array.every() returns true for empty arrays
      expect(computeCanProceed(state)).toBe(true);
    });
  });

  describe("Step 5: Review", () => {
    it("always allows proceeding from review step", () => {
      const state = { ...initialState, currentStep: 5 as WizardStep };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("allows proceeding regardless of other state", () => {
      const state = {
        ...initialState,
        currentStep: 5 as WizardStep,
        file: null, // Would block step 2
        selectedCatalogId: null, // Would block step 3
        fieldMappings: [], // Technically valid
      };
      expect(computeCanProceed(state)).toBe(true);
    });
  });

  describe("Step 6: Processing", () => {
    it("never allows proceeding from processing step", () => {
      const state = { ...initialState, currentStep: 6 as WizardStep };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks even after processing completes", () => {
      const state = { ...initialState, currentStep: 6 as WizardStep, ingestFileId: 123 };
      expect(computeCanProceed(state)).toBe(false);
    });
  });

  describe("Invalid Steps", () => {
    it("returns false for invalid step numbers", () => {
      const state = { ...initialState, currentStep: 0 as WizardStep };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("returns false for step 7 (out of range)", () => {
      const state = { ...initialState, currentStep: 7 as WizardStep };
      expect(computeCanProceed(state)).toBe(false);
    });
  });
});
