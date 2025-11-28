/**
 * Unit tests for the wizard context state management.
 *
 * Tests the wizard reducer logic for the import wizard.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import type {
  FieldMapping,
  SheetInfo,
  SheetMapping,
  WizardStep,
} from "../../../app/(frontend)/import/_components/wizard-context";

// Re-create the reducer logic for testing since it's internal to the component
// This tests the reducer logic without needing React context

interface WizardState {
  currentStep: WizardStep;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  userId: number | null;
  previewId: string | null;
  file: { name: string; size: number; mimeType: string } | null;
  sheets: SheetInfo[];
  selectedCatalogId: number | "new" | null;
  newCatalogName: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  importFileId: number | null;
  isProcessing: boolean;
  error: string | null;
  lastSavedAt: string | null;
}

type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_AUTH"; isAuthenticated: boolean; isEmailVerified: boolean; userId: number | null }
  | { type: "SET_FILE"; file: WizardState["file"]; sheets: SheetInfo[]; previewId: string }
  | { type: "CLEAR_FILE" }
  | { type: "SET_CATALOG"; catalogId: number | "new" | null; newCatalogName?: string }
  | { type: "SET_SHEET_MAPPING"; sheetIndex: number; mapping: Partial<SheetMapping> }
  | { type: "SET_FIELD_MAPPING"; sheetIndex: number; mapping: Partial<FieldMapping> }
  | {
      type: "SET_IMPORT_OPTIONS";
      deduplicationStrategy?: WizardState["deduplicationStrategy"];
      geocodingEnabled?: boolean;
    }
  | { type: "START_PROCESSING"; importFileId: number }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "COMPLETE" }
  | { type: "RESET" };

const initialState: WizardState = {
  currentStep: 1,
  isAuthenticated: false,
  isEmailVerified: false,
  userId: null,
  previewId: null,
  file: null,
  sheets: [],
  selectedCatalogId: null,
  newCatalogName: "",
  sheetMappings: [],
  fieldMappings: [],
  deduplicationStrategy: "skip",
  geocodingEnabled: true,
  importFileId: null,
  isProcessing: false,
  error: null,
  lastSavedAt: null,
};

// Minimal reducer implementation for testing
const wizardReducer = (state: WizardState, action: WizardAction): WizardState => {
  const newState = (() => {
    switch (action.type) {
      case "SET_STEP":
        return { ...state, currentStep: action.step };
      case "NEXT_STEP":
        return { ...state, currentStep: Math.min(state.currentStep + 1, 6) as WizardStep };
      case "PREV_STEP":
        return { ...state, currentStep: Math.max(state.currentStep - 1, 1) as WizardStep };
      case "SET_AUTH":
        return {
          ...state,
          isAuthenticated: action.isAuthenticated,
          isEmailVerified: action.isEmailVerified,
          userId: action.userId,
        };
      case "SET_FILE":
        return {
          ...state,
          file: action.file,
          sheets: action.sheets,
          previewId: action.previewId,
          sheetMappings: action.sheets.map((sheet) => ({
            sheetIndex: sheet.index,
            datasetId: "new" as const,
            newDatasetName: sheet.name,
            similarityScore: null,
          })),
          fieldMappings: action.sheets.map((sheet) => ({
            sheetIndex: sheet.index,
            titleField: null,
            descriptionField: null,
            locationNameField: null,
            dateField: null,
            idField: null,
            idStrategy: "auto" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          })),
        };
      case "CLEAR_FILE":
        return { ...state, file: null, sheets: [], previewId: null, sheetMappings: [], fieldMappings: [] };
      case "SET_CATALOG":
        return {
          ...state,
          selectedCatalogId: action.catalogId,
          newCatalogName: action.newCatalogName ?? state.newCatalogName,
        };
      case "SET_SHEET_MAPPING": {
        const mappings = [...state.sheetMappings];
        const index = mappings.findIndex((m) => m.sheetIndex === action.sheetIndex);
        if (index >= 0 && mappings[index]) {
          mappings[index] = { ...mappings[index], ...action.mapping };
        }
        return { ...state, sheetMappings: mappings };
      }
      case "SET_FIELD_MAPPING": {
        const mappings = [...state.fieldMappings];
        const index = mappings.findIndex((m) => m.sheetIndex === action.sheetIndex);
        if (index >= 0 && mappings[index]) {
          mappings[index] = { ...mappings[index], ...action.mapping };
        }
        return { ...state, fieldMappings: mappings };
      }
      case "SET_IMPORT_OPTIONS":
        return {
          ...state,
          deduplicationStrategy: action.deduplicationStrategy ?? state.deduplicationStrategy,
          geocodingEnabled: action.geocodingEnabled ?? state.geocodingEnabled,
        };
      case "START_PROCESSING":
        return { ...state, importFileId: action.importFileId, isProcessing: true, error: null };
      case "SET_ERROR":
        return { ...state, error: action.error, isProcessing: false };
      case "COMPLETE":
        return { ...initialState };
      case "RESET":
        return { ...initialState };
      default:
        return state;
    }
  })();

  return { ...newState, lastSavedAt: new Date().toISOString() };
};

describe("Wizard Reducer", () => {
  describe("Navigation", () => {
    it("SET_STEP changes current step", () => {
      const result = wizardReducer(initialState, { type: "SET_STEP", step: 3 });
      expect(result.currentStep).toBe(3);
    });

    it("NEXT_STEP increments step", () => {
      const result = wizardReducer(initialState, { type: "NEXT_STEP" });
      expect(result.currentStep).toBe(2);
    });

    it("NEXT_STEP does not exceed step 6", () => {
      const state = { ...initialState, currentStep: 6 as WizardStep };
      const result = wizardReducer(state, { type: "NEXT_STEP" });
      expect(result.currentStep).toBe(6);
    });

    it("PREV_STEP decrements step", () => {
      const state = { ...initialState, currentStep: 3 as WizardStep };
      const result = wizardReducer(state, { type: "PREV_STEP" });
      expect(result.currentStep).toBe(2);
    });

    it("PREV_STEP does not go below step 1", () => {
      const result = wizardReducer(initialState, { type: "PREV_STEP" });
      expect(result.currentStep).toBe(1);
    });
  });

  describe("Authentication", () => {
    it("SET_AUTH updates authentication state", () => {
      const result = wizardReducer(initialState, {
        type: "SET_AUTH",
        isAuthenticated: true,
        isEmailVerified: true,
        userId: 123,
      });

      expect(result.isAuthenticated).toBe(true);
      expect(result.isEmailVerified).toBe(true);
      expect(result.userId).toBe(123);
    });

    it("SET_AUTH handles logout", () => {
      const state = { ...initialState, isAuthenticated: true, isEmailVerified: true, userId: 123 };
      const result = wizardReducer(state, {
        type: "SET_AUTH",
        isAuthenticated: false,
        isEmailVerified: false,
        userId: null,
      });

      expect(result.isAuthenticated).toBe(false);
      expect(result.isEmailVerified).toBe(false);
      expect(result.userId).toBeNull();
    });
  });

  describe("File Upload", () => {
    const mockFile = { name: "test.csv", size: 1024, mimeType: "text/csv" };
    const mockSheets: SheetInfo[] = [
      { index: 0, name: "Sheet1", rowCount: 100, headers: ["title", "date"], sampleData: [] },
      { index: 1, name: "Sheet2", rowCount: 50, headers: ["name", "location"], sampleData: [] },
    ];

    it("SET_FILE sets file, sheets, and previewId", () => {
      const result = wizardReducer(initialState, {
        type: "SET_FILE",
        file: mockFile,
        sheets: mockSheets,
        previewId: "preview-123",
      });

      expect(result.file).toEqual(mockFile);
      expect(result.sheets).toEqual(mockSheets);
      expect(result.previewId).toBe("preview-123");
    });

    it("SET_FILE initializes sheetMappings for each sheet", () => {
      const result = wizardReducer(initialState, {
        type: "SET_FILE",
        file: mockFile,
        sheets: mockSheets,
        previewId: "preview-123",
      });

      expect(result.sheetMappings).toHaveLength(2);
      expect(result.sheetMappings[0]).toEqual({
        sheetIndex: 0,
        datasetId: "new",
        newDatasetName: "Sheet1",
        similarityScore: null,
      });
      expect(result.sheetMappings[1]).toEqual({
        sheetIndex: 1,
        datasetId: "new",
        newDatasetName: "Sheet2",
        similarityScore: null,
      });
    });

    it("SET_FILE initializes fieldMappings for each sheet", () => {
      const result = wizardReducer(initialState, {
        type: "SET_FILE",
        file: mockFile,
        sheets: mockSheets,
        previewId: "preview-123",
      });

      expect(result.fieldMappings).toHaveLength(2);
      expect(result.fieldMappings[0]?.sheetIndex).toBe(0);
      expect(result.fieldMappings[0]?.idStrategy).toBe("auto");
      expect(result.fieldMappings[1]?.sheetIndex).toBe(1);
    });

    it("CLEAR_FILE resets file-related state", () => {
      const state = {
        ...initialState,
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
            idField: null,
            idStrategy: "auto" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      };

      const result = wizardReducer(state, { type: "CLEAR_FILE" });

      expect(result.file).toBeNull();
      expect(result.sheets).toHaveLength(0);
      expect(result.previewId).toBeNull();
      expect(result.sheetMappings).toHaveLength(0);
      expect(result.fieldMappings).toHaveLength(0);
    });
  });

  describe("Dataset Selection", () => {
    it("SET_CATALOG sets catalog ID", () => {
      const result = wizardReducer(initialState, {
        type: "SET_CATALOG",
        catalogId: 42,
      });

      expect(result.selectedCatalogId).toBe(42);
    });

    it("SET_CATALOG sets new catalog name", () => {
      const result = wizardReducer(initialState, {
        type: "SET_CATALOG",
        catalogId: "new",
        newCatalogName: "My New Catalog",
      });

      expect(result.selectedCatalogId).toBe("new");
      expect(result.newCatalogName).toBe("My New Catalog");
    });

    it("SET_SHEET_MAPPING updates specific sheet mapping", () => {
      const state = {
        ...initialState,
        sheetMappings: [
          { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Sheet1", similarityScore: null },
          { sheetIndex: 1, datasetId: "new" as const, newDatasetName: "Sheet2", similarityScore: null },
        ],
      };

      const result = wizardReducer(state, {
        type: "SET_SHEET_MAPPING",
        sheetIndex: 0,
        mapping: { datasetId: 123, newDatasetName: "" },
      });

      expect(result.sheetMappings[0]?.datasetId).toBe(123);
      expect(result.sheetMappings[1]?.datasetId).toBe("new"); // Unchanged
    });
  });

  describe("Field Mapping", () => {
    it("SET_FIELD_MAPPING updates specific field mapping", () => {
      const state = {
        ...initialState,
        fieldMappings: [
          {
            sheetIndex: 0,
            titleField: null,
            descriptionField: null,
            locationNameField: null,
            dateField: null,
            idField: null,
            idStrategy: "auto" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      };

      const result = wizardReducer(state, {
        type: "SET_FIELD_MAPPING",
        sheetIndex: 0,
        mapping: {
          titleField: "name",
          dateField: "created_at",
          locationField: "address",
        },
      });

      expect(result.fieldMappings[0]?.titleField).toBe("name");
      expect(result.fieldMappings[0]?.dateField).toBe("created_at");
      expect(result.fieldMappings[0]?.locationField).toBe("address");
      expect(result.fieldMappings[0]?.idStrategy).toBe("auto"); // Unchanged
    });

    it("SET_FIELD_MAPPING updates idStrategy", () => {
      const state = {
        ...initialState,
        fieldMappings: [
          {
            sheetIndex: 0,
            titleField: null,
            descriptionField: null,
            locationNameField: null,
            dateField: null,
            idField: null,
            idStrategy: "auto" as const,
            locationField: null,
            latitudeField: null,
            longitudeField: null,
          },
        ],
      };

      const result = wizardReducer(state, {
        type: "SET_FIELD_MAPPING",
        sheetIndex: 0,
        mapping: { idStrategy: "external", idField: "uuid" },
      });

      expect(result.fieldMappings[0]?.idStrategy).toBe("external");
      expect(result.fieldMappings[0]?.idField).toBe("uuid");
    });
  });

  describe("Import Options", () => {
    it("SET_IMPORT_OPTIONS updates deduplication strategy", () => {
      const result = wizardReducer(initialState, {
        type: "SET_IMPORT_OPTIONS",
        deduplicationStrategy: "update",
      });

      expect(result.deduplicationStrategy).toBe("update");
      expect(result.geocodingEnabled).toBe(true); // Unchanged
    });

    it("SET_IMPORT_OPTIONS updates geocoding toggle", () => {
      const result = wizardReducer(initialState, {
        type: "SET_IMPORT_OPTIONS",
        geocodingEnabled: false,
      });

      expect(result.geocodingEnabled).toBe(false);
      expect(result.deduplicationStrategy).toBe("skip"); // Unchanged
    });

    it("SET_IMPORT_OPTIONS updates both options", () => {
      const result = wizardReducer(initialState, {
        type: "SET_IMPORT_OPTIONS",
        deduplicationStrategy: "version",
        geocodingEnabled: false,
      });

      expect(result.deduplicationStrategy).toBe("version");
      expect(result.geocodingEnabled).toBe(false);
    });
  });

  describe("Processing", () => {
    it("START_PROCESSING sets processing state", () => {
      const result = wizardReducer(initialState, {
        type: "START_PROCESSING",
        importFileId: 456,
      });

      expect(result.importFileId).toBe(456);
      expect(result.isProcessing).toBe(true);
      expect(result.error).toBeNull();
    });

    it("SET_ERROR sets error and clears processing", () => {
      const state = { ...initialState, isProcessing: true };
      const result = wizardReducer(state, {
        type: "SET_ERROR",
        error: "Import failed: invalid data",
      });

      expect(result.error).toBe("Import failed: invalid data");
      expect(result.isProcessing).toBe(false);
    });

    it("SET_ERROR clears error when null", () => {
      const state = { ...initialState, error: "Previous error" };
      const result = wizardReducer(state, { type: "SET_ERROR", error: null });

      expect(result.error).toBeNull();
    });
  });

  describe("Reset", () => {
    it("COMPLETE resets to initial state", () => {
      const state = {
        ...initialState,
        currentStep: 5 as WizardStep,
        isAuthenticated: true,
        file: { name: "test.csv", size: 1024, mimeType: "text/csv" },
        importFileId: 789,
        isProcessing: true,
      };

      const result = wizardReducer(state, { type: "COMPLETE" });

      expect(result.currentStep).toBe(1);
      expect(result.file).toBeNull();
      expect(result.importFileId).toBeNull();
      expect(result.isProcessing).toBe(false);
    });

    it("RESET resets to initial state", () => {
      const state = {
        ...initialState,
        currentStep: 3 as WizardStep,
        selectedCatalogId: 42,
        error: "Some error",
      };

      const result = wizardReducer(state, { type: "RESET" });

      expect(result.currentStep).toBe(1);
      expect(result.selectedCatalogId).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe("State Persistence", () => {
    it("updates lastSavedAt on every action", () => {
      const originalDate = initialState.lastSavedAt;
      const result = wizardReducer(initialState, { type: "NEXT_STEP" });

      expect(result.lastSavedAt).not.toBe(originalDate);
      expect(result.lastSavedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
  // Helper function to compute canProceed (mirrors wizard-context.tsx logic)
  const computeCanProceed = (state: WizardState): boolean => {
    switch (state.currentStep) {
      case 1:
        return state.isAuthenticated && state.isEmailVerified;
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
      const state = {
        ...initialState,
        currentStep: 1 as WizardStep,
        isAuthenticated: true,
        isEmailVerified: false,
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks if only verified but not authenticated", () => {
      const state = {
        ...initialState,
        currentStep: 1 as WizardStep,
        isAuthenticated: false,
        isEmailVerified: true,
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("allows proceeding when both authenticated and verified", () => {
      const state = {
        ...initialState,
        currentStep: 1 as WizardStep,
        isAuthenticated: true,
        isEmailVerified: true,
        userId: 123,
      };
      expect(computeCanProceed(state)).toBe(true);
    });
  });

  describe("Step 2: File Upload", () => {
    it("blocks with null file", () => {
      const state = {
        ...initialState,
        currentStep: 2 as WizardStep,
        file: null,
        sheets: [],
      };
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
      const state = {
        ...initialState,
        currentStep: 3 as WizardStep,
        selectedCatalogId: 1,
        sheetMappings: [],
      };
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
      idField: null,
      idStrategy: "auto",
      locationField: null,
      latitudeField: null,
      longitudeField: null,
    };

    it("blocks when missing titleField", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: null,
            dateField: "date",
            locationField: "address",
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks when missing dateField", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: null,
            locationField: "address",
          },
        ],
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
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: "date",
            latitudeField: "lat",
            longitudeField: null,
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks when only longitude without latitude", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: "date",
            latitudeField: null,
            longitudeField: "lng",
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("allows proceeding with locationField as geo requirement", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: "date",
            locationField: "address",
          },
        ],
      };
      expect(computeCanProceed(state)).toBe(true);
    });

    it("allows proceeding with lat+lng as geo requirement", () => {
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [
          {
            ...baseFieldMapping,
            titleField: "name",
            dateField: "date",
            latitudeField: "lat",
            longitudeField: "lng",
          },
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
          {
            ...baseFieldMapping,
            sheetIndex: 0,
            titleField: "name",
            dateField: "date",
            locationField: "address",
          },
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
          {
            ...baseFieldMapping,
            sheetIndex: 0,
            titleField: "name",
            dateField: "date",
            locationField: "address",
          },
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
      const state = {
        ...initialState,
        currentStep: 4 as WizardStep,
        fieldMappings: [],
      };
      // Array.every() returns true for empty arrays
      expect(computeCanProceed(state)).toBe(true);
    });
  });

  describe("Step 5: Review", () => {
    it("always allows proceeding from review step", () => {
      const state = {
        ...initialState,
        currentStep: 5 as WizardStep,
      };
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
      const state = {
        ...initialState,
        currentStep: 6 as WizardStep,
        isProcessing: true,
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("blocks even after processing completes", () => {
      const state = {
        ...initialState,
        currentStep: 6 as WizardStep,
        isProcessing: false,
        importFileId: 123,
      };
      expect(computeCanProceed(state)).toBe(false);
    });
  });

  describe("Invalid Steps", () => {
    it("returns false for invalid step numbers", () => {
      const state = {
        ...initialState,
        currentStep: 0 as WizardStep,
      };
      expect(computeCanProceed(state)).toBe(false);
    });

    it("returns false for step 7 (out of range)", () => {
      const state = {
        ...initialState,
        currentStep: 7 as WizardStep,
      };
      expect(computeCanProceed(state)).toBe(false);
    });
  });
});
