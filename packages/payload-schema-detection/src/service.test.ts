/**
 * Schema Detection Service tests.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaDetectionService } from "./service";
import type { DetectionContext, FieldStatistics, SchemaDetector } from "./types";

// Factory functions to create fresh mocks for each test
const createMockDefaultDetector = (): SchemaDetector => ({
  name: "default",
  label: "Default Detector",
  canHandle: vi.fn().mockReturnValue(true),
  detect: vi.fn().mockResolvedValue({
    language: { code: "eng", name: "English", confidence: 0.9, isReliable: true },
    fieldMappings: {
      title: { path: "title", confidence: 0.8 },
      description: null,
      timestamp: null,
      locationName: null,
      geo: null,
    },
    patterns: { idFields: [], enumFields: [] },
  }),
});

const createMockCustomDetector = (): SchemaDetector => ({
  name: "custom",
  label: "Custom Detector",
  canHandle: vi.fn().mockReturnValue(true),
  detect: vi.fn().mockResolvedValue({
    language: { code: "deu", name: "German", confidence: 0.95, isReliable: true },
    fieldMappings: {
      title: { path: "titel", confidence: 0.9 },
      description: { path: "beschreibung", confidence: 0.85 },
      timestamp: null,
      locationName: null,
      geo: null,
    },
    patterns: { idFields: ["id"], enumFields: ["status"] },
  }),
});

const createMockUnableDetector = (): SchemaDetector => ({
  name: "unable",
  label: "Unable Detector",
  canHandle: vi.fn().mockReturnValue(false),
  detect: vi.fn().mockRejectedValue(new Error("Should not be called")),
});

// Declare mocks that will be reset before each test
let mockDefaultDetector: SchemaDetector;
let mockCustomDetector: SchemaDetector;
let mockUnableDetector: SchemaDetector;

beforeEach(() => {
  mockDefaultDetector = createMockDefaultDetector();
  mockCustomDetector = createMockCustomDetector();
  mockUnableDetector = createMockUnableDetector();
});

const createFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics => ({
  path: "test",
  occurrences: 100,
  occurrencePercent: 100,
  nullCount: 0,
  uniqueValues: 100,
  uniqueSamples: [],
  typeDistribution: { string: 100 },
  formats: {},
  isEnumCandidate: false,
  firstSeen: new Date(),
  lastSeen: new Date(),
  depth: 0,
  ...overrides,
});

const createContext = (): DetectionContext => ({
  fieldStats: {
    title: createFieldStats(),
    date: createFieldStats({ formats: { date: 100 } }),
  },
  sampleData: [
    { title: "Event 1", date: "2024-01-15" },
    { title: "Event 2", date: "2024-01-16" },
  ],
  headers: ["title", "date"],
  config: { enabled: true, priority: 100 },
});

// eslint-disable-next-line sonarjs/max-lines-per-function -- Test suite with extensive service tests
describe("SchemaDetectionService", () => {
  describe("constructor", () => {
    it("registers detectors by name", () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockCustomDetector]);

      expect(service.getDetector("default")).toBe(mockDefaultDetector);
      expect(service.getDetector("custom")).toBe(mockCustomDetector);
    });

    it("sets default detector when named 'default'", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector]);
      const context = createContext();

      const result = await service.detect(null, context);

      expect(mockDefaultDetector.detect).toHaveBeenCalled();
      expect(result.language.code).toBe("eng");
    });

    it("uses last detector as fallback when no explicit default", async () => {
      const fallbackDetector: SchemaDetector = {
        name: "fallback",
        label: "Fallback",
        canHandle: vi.fn().mockReturnValue(true),
        detect: vi.fn().mockResolvedValue({
          language: { code: "fra", name: "French", confidence: 0.8, isReliable: true },
          fieldMappings: { title: null, description: null, timestamp: null, locationName: null, geo: null },
          patterns: { idFields: [], enumFields: [] },
        }),
      };

      // Create a custom detector that cannot handle
      const customThatCantHandle = createMockCustomDetector();
      vi.mocked(customThatCantHandle.canHandle).mockReturnValue(false);

      const service = new SchemaDetectionService([customThatCantHandle, fallbackDetector]);
      const context = createContext();

      const result = await service.detect(null, context);

      expect(result.language.code).toBe("fra");
    });
  });

  describe("register", () => {
    it("adds new detector", () => {
      const service = new SchemaDetectionService([]);
      service.register(mockCustomDetector);

      expect(service.getDetector("custom")).toBe(mockCustomDetector);
    });

    it("updates default when registering detector named 'default'", async () => {
      const service = new SchemaDetectionService([]);
      service.register(mockDefaultDetector);
      const context = createContext();

      await service.detect(null, context);

      expect(mockDefaultDetector.detect).toHaveBeenCalled();
    });
  });

  describe("getAllDetectors", () => {
    it("returns all registered detectors", () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockCustomDetector]);

      const detectors = service.getAllDetectors();

      expect(detectors).toHaveLength(2);
      expect(detectors).toContain(mockDefaultDetector);
      expect(detectors).toContain(mockCustomDetector);
    });
  });

  describe("detect", () => {
    it("uses specified detector when it can handle", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockCustomDetector]);
      const context = createContext();
      // mockCustomDetector.canHandle already returns true by default

      const result = await service.detect("custom", context);

      expect(mockCustomDetector.canHandle).toHaveBeenCalledWith(context);
      expect(mockCustomDetector.detect).toHaveBeenCalledWith(context);
      expect(result.language.code).toBe("deu");
    });

    it("falls back to default when specified detector cannot handle", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockUnableDetector]);
      const context = createContext();

      const result = await service.detect("unable", context);

      expect(mockUnableDetector.canHandle).toHaveBeenCalled();
      expect(mockUnableDetector.detect).not.toHaveBeenCalled();
      expect(mockDefaultDetector.detect).toHaveBeenCalled();
      expect(result.language.code).toBe("eng");
    });

    it("falls back to default when specified detector not found", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector]);
      const context = createContext();

      const result = await service.detect("nonexistent", context);

      expect(mockDefaultDetector.detect).toHaveBeenCalled();
      expect(result.language.code).toBe("eng");
    });

    it("uses default when null detector name provided", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockCustomDetector]);
      const context = createContext();

      const result = await service.detect(null, context);

      expect(mockDefaultDetector.detect).toHaveBeenCalled();
      expect(result.language.code).toBe("eng");
    });

    it("returns empty result when no detectors available", async () => {
      const service = new SchemaDetectionService([]);
      const context = createContext();

      const result = await service.detect(null, context);

      expect(result.language.code).toBe("eng");
      expect(result.language.confidence).toBe(0);
      expect(result.language.isReliable).toBe(false);
      expect(result.fieldMappings.title).toBeNull();
    });
  });

  describe("findCompatibleDetector", () => {
    it("returns first compatible non-default detector", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockCustomDetector]);
      const context = createContext();
      // mockCustomDetector.canHandle already returns true by default

      const detector = await service.findCompatibleDetector(context);

      expect(detector).toBe(mockCustomDetector);
    });

    it("returns default when no other detector can handle", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector, mockUnableDetector]);
      const context = createContext();

      const detector = await service.findCompatibleDetector(context);

      expect(detector).toBe(mockDefaultDetector);
    });

    it("skips default detector in first pass", async () => {
      const service = new SchemaDetectionService([mockDefaultDetector]);
      const context = createContext();

      const detector = await service.findCompatibleDetector(context);

      // Should return default even though it's the only one
      expect(detector).toBe(mockDefaultDetector);
      // But canHandle on default should not have been called (it's checked as fallback)
    });
  });
});
