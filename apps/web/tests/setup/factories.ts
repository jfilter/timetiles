/**
 * Test data factories and utilities for creating test objects.
 *
 * Provides factory functions for generating test data including:
 * - Utility data (dates, coordinates, files, CSV)
 * - Rich text structures for Payload CMS
 * - Domain objects (catalogs, datasets, events)
 * - Mock infrastructure (Payload, JobHandlerContext, test data)
 *
 * @module
 * @category Test Setup
 */
import { vi } from "vitest";

import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import type { Catalog, Dataset, Event } from "@/payload-types";

// =============================================================================
// Utility Factories
// =============================================================================

export const createDateRange = (startDate: string, days: number) => {
  const start = new Date(startDate);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date.toISOString();
  });
};

export const createCoordinateGrid = (centerLat: number, centerLng: number, count: number, spread: number = 0.01) => {
  return Array.from({ length: count }, () => ({
    latitude: centerLat + (Math.random() - 0.5) * spread,
    longitude: centerLng + (Math.random() - 0.5) * spread,
  }));
};

export const createTestFile = (name: string, content: string, type: string = "text/csv") => {
  return new File([content], name, { type });
};

export const createCSVContent = (headers: string[], rows: string[][]) => {
  const csvRows = [headers.join(","), ...rows.map((row) => row.join(","))];
  return csvRows.join("\n");
};

// =============================================================================
// Rich Text Helpers for Payload CMS
// =============================================================================

export const createRichText = (text: string) => ({
  root: {
    type: "root",
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [
          {
            type: "text",
            text,
            version: 1,
          },
        ],
      },
    ],
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
  },
});

export const createRichTextWithFormatting = (text: string, formatting: "bold" | "italic" = "bold") => ({
  root: {
    type: "root",
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [
          {
            type: "text",
            text,
            format: formatting === "bold" ? 1 : 2, // 1 = bold, 2 = italic
            version: 1,
          },
        ],
      },
    ],
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
  },
});

// =============================================================================
// Domain Object Factories - Catalogs
// =============================================================================

export const createCatalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  id: 1,
  name: "Test Catalog",
  description: createRichText("A test catalog description"),
  slug: "test-catalog",
  _status: "published" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createCatalogs = (count: number = 3): Catalog[] => {
  return Array.from({ length: count }, (_, i) =>
    createCatalog({
      id: i + 1,
      name: `Test Catalog ${i + 1}`,
      slug: `test-catalog-${i + 1}`,
      description: createRichText(`Description for catalog ${i + 1}`),
    })
  );
};

// =============================================================================
// Domain Object Factories - Datasets
// =============================================================================

export const createDataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: 1,
  name: "Test Dataset",
  description: createRichText("A test dataset description"),
  catalog: 1,
  slug: "test-dataset",
  language: "eng",
  _status: "published" as const,
  isPublic: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createDatasets = (count: number = 3): Dataset[] => {
  // Define dataset names that match test expectations
  const datasetNames = ["Air Quality Measurements", "Water Quality Data", "GDP Growth Rates"];

  return Array.from({ length: count }, (_, i) => {
    const catalogId = (i % 2) + 1;
    // For dataset 3, use catalog 1 to match the test expectations
    const actualCatalogId = i === 2 ? 1 : catalogId;

    return createDataset({
      id: i + 1,
      name: datasetNames[i] ?? `Test Dataset ${i + 1}`,
      slug: `test-dataset-${i + 1}`,
      description: createRichText(`Description for dataset ${i + 1}`),
      catalog: { id: actualCatalogId } as any, // Mock as object with id property
    });
  });
};

// =============================================================================
// Domain Object Factories - Events
// =============================================================================

export const createEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  dataset: 1,
  uniqueId: "test-event-1",
  data: {
    title: "Test Event",
    description: "A test event description",
    date: "2024-03-15T10:00:00Z",
    category: "conference",
    tags: ["tech", "test"],
  },
  location: {
    latitude: 40.7128,
    longitude: -74.006,
  },
  coordinateSource: {
    type: "import",
  },
  updatedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createEvents = (count: number = 3): Event[] => {
  return Array.from({ length: count }, (_, i) =>
    createEvent({
      id: i + 1,
      dataset: 1,
      uniqueId: `test-event-${i + 1}`,
      data: {
        title: `Test Event ${i + 1}`,
        description: `Description for event ${i + 1}`,
        date: `2024-03-${15 + i}T10:00:00Z`,
      },
      location: {
        latitude: 40.7128 + i * 0.01,
        longitude: -74.006 + i * 0.01,
      },
    })
  );
};

// Simple event data for Map component (flattened structure)
export const createMapEvent = (overrides: any = {}) => ({
  id: "map-event-1",
  title: "Map Event",
  latitude: 40.7128,
  longitude: -74.006,
  ...overrides,
});

export const createMapEvents = (count: number = 3) => {
  return Array.from({ length: count }, (_, i) =>
    createMapEvent({
      id: `map-event-${i + 1}`,
      title: `Map Event ${i + 1}`,
      latitude: 40.7128 + i * 0.01,
      longitude: -74.006 + i * 0.01,
    })
  );
};

// =============================================================================
// Test Constants
// =============================================================================

/**
 * Standard test IDs to avoid magic strings in tests.
 * Use these instead of hardcoded values for consistency.
 */
export const TEST_IDS = {
  IMPORT_JOB: "import-123",
  DATASET: "dataset-456",
  IMPORT_FILE: "file-789",
  JOB: "test-job-1",
  USER: "user-123",
  CATALOG: "catalog-123",
  SCHEMA_VERSION: "schema-v1",
} as const;

/**
 * Standard test filenames to avoid magic strings.
 */
export const TEST_FILENAMES = {
  CSV: "test.csv",
  EXCEL: "test.xlsx",
  EMPTY: "empty.csv",
} as const;

// =============================================================================
// Mock Infrastructure Factories (for Unit Tests)
// =============================================================================

/**
 * Creates a mock Payload object with common methods for job handler tests.
 *
 * Provides mocked versions of commonly used Payload methods:
 * - findByID, find, create, update
 * - jobs.queue for job queueing
 *
 * @param overrides - Optional overrides for specific mock methods
 * @returns Mock Payload object with vi.fn() mocks
 *
 * @example
 * ```typescript
 * const mockPayload = createMockPayload();
 * mockPayload.findByID.mockResolvedValueOnce({ id: "123", name: "Test" });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMockPayload = (overrides: Partial<any> = {}): any => {
  return {
    findByID: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    jobs: {
      queue: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
};

/**
 * Creates a mock JobHandlerContext for job handler tests.
 *
 * @param payload - Mock Payload instance (use createMockPayload())
 * @param input - Job input data (varies by job type)
 * @param jobId - Job ID (default: "test-job-1")
 * @returns JobHandlerContext mock object
 *
 * @example
 * ```typescript
 * const mockPayload = createMockPayload();
 * const mockContext = createMockContext(mockPayload, {
 *   importJobId: TEST_IDS.IMPORT_JOB,
 *   batchNumber: 0,
 * });
 * ```
 */
export const createMockContext = <T = unknown>(
  payload: unknown,
  input: T,
  jobId: string = TEST_IDS.JOB
): JobHandlerContext => {
  return {
    payload,
    job: {
      id: jobId,
      taskStatus: "running",
    },
    input,
  } as unknown as JobHandlerContext;
};

/**
 * Creates a mock ImportJob object for testing.
 *
 * @param options - Configuration options
 * @returns Mock ImportJob object matching Payload structure
 *
 * @example
 * ```typescript
 * const job = createMockImportJob({ hasDuplicates: true });
 * const jobWithProgress = createMockImportJob({
 *   progress: { current: 50, total: 100 }
 * });
 * ```
 */
export interface MockImportJobOptions {
  id?: string | number;
  dataset?: string | number;
  importFile?: string | number;
  sheetIndex?: number;
  hasDuplicates?: boolean;
  progress?: Record<string, any>;
  schemaBuilderState?: any;
  stage?: string;
  status?: string;
  errors?: any[];
}

export const createMockImportJob = (options: MockImportJobOptions = {}) => {
  // Create a properly initialized stage progress structure
  const createStageProgress = () => ({
    status: "pending" as const,
    startedAt: null,
    completedAt: null,
    rowsProcessed: 0,
    rowsTotal: 0,
    batchesProcessed: 0,
    batchesTotal: 0,
    currentBatchRows: 0,
    currentBatchTotal: 0,
    rowsPerSecond: null,
    estimatedSecondsRemaining: null,
  });

  const defaultProgress = {
    stages: {
      "analyze-duplicates": createStageProgress(),
      "detect-schema": createStageProgress(),
      "validate-schema": createStageProgress(),
      "await-approval": createStageProgress(),
      "create-schema-version": createStageProgress(),
      "geocode-batch": createStageProgress(),
      "create-events": createStageProgress(),
    },
    overallPercentage: 0,
    estimatedCompletionTime: null,
  };

  return {
    id: options.id ?? TEST_IDS.IMPORT_JOB,
    dataset: options.dataset ?? TEST_IDS.DATASET,
    importFile: options.importFile ?? TEST_IDS.IMPORT_FILE,
    sheetIndex: options.sheetIndex ?? 0,
    stage: options.stage ?? "SCHEMA_DETECTION",
    status: options.status ?? "processing",
    duplicates: options.hasDuplicates
      ? {
          internal: [{ rowNumber: 1, uniqueId: "dup-1" }],
          external: [{ rowNumber: 2, uniqueId: "dup-2" }],
          summary: {
            totalRows: 3,
            uniqueRows: 1,
            internalDuplicates: 1,
            externalDuplicates: 1,
          },
        }
      : {
          internal: [],
          external: [],
          summary: {
            totalRows: 100,
            uniqueRows: 100,
            internalDuplicates: 0,
            externalDuplicates: 0,
          },
        },
    progress: options.progress ?? defaultProgress,
    errors: options.errors ?? [],
    schemaBuilderState: options.schemaBuilderState,
  };
};

/**
 * Creates a mock Dataset object for testing.
 *
 * This extends the existing createDataset() but provides job-specific defaults.
 *
 * @param id - Dataset ID (default: TEST_IDS.DATASET)
 * @param name - Dataset name (default: "Test Dataset")
 * @param options - Additional options
 * @returns Mock Dataset object
 *
 * @example
 * ```typescript
 * const dataset = createMockDataset();
 * const lockedDataset = createMockDataset("dataset-1", "Locked DS", {
 *   schemaConfig: { locked: true }
 * });
 * ```
 */
export const createMockDataset = (
  id: string | number = TEST_IDS.DATASET,
  name: string = "Test Dataset",
  options: {
    schemaConfig?: unknown;
    deduplicationConfig?: unknown;
    idStrategy?: unknown;
  } = {}
) => {
  return {
    id,
    name,
    schemaConfig: options.schemaConfig ?? {
      autoGrow: true,
      autoApproveNonBreaking: true,
      locked: false,
    },
    deduplicationConfig: options.deduplicationConfig ?? {
      enabled: true,
    },
    idStrategy: options.idStrategy ?? {
      type: "external" as const,
      externalIdPath: "id",
    },
  };
};

/**
 * Creates a mock ImportFile object for testing.
 *
 * @param id - Import file ID (default: TEST_IDS.IMPORT_FILE)
 * @param filename - Filename (default: TEST_FILENAMES.CSV)
 * @param options - Additional options
 * @returns Mock ImportFile object
 *
 * @example
 * ```typescript
 * const file = createMockImportFile();
 * const excelFile = createMockImportFile("file-1", TEST_FILENAMES.EXCEL);
 * ```
 */
export const createMockImportFile = (
  id: string | number = TEST_IDS.IMPORT_FILE,
  filename: string = TEST_FILENAMES.CSV,
  options: {
    filePath?: string;
    status?: string;
  } = {}
) => {
  return {
    id,
    filename,
    filePath: options.filePath ?? `/tmp/${filename}`,
    status: options.status ?? "uploaded",
  };
};
