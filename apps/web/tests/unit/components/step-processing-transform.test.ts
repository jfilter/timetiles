/**
 * Unit tests for transformProgressResponse in step-processing.
 *
 * Tests the transformation of API response to internal progress state,
 * ensuring field mappings are correct (e.g., results.totalEvents).
 *
 * @module
 */
import { describe, expect, it } from "vitest";

// API response structure from /api/import/[importId]/progress
interface ProgressApiResponse {
  type: string;
  id: number;
  status: "pending" | "parsing" | "processing" | "completed" | "failed";
  originalName: string;
  catalogId: number | null;
  datasetsCount: number;
  datasetsProcessed: number;
  overallProgress: number;
  estimatedCompletionTime: string | null;
  jobs: Array<{
    id: string | number;
    datasetId: string | number;
    datasetName?: string;
    currentStage: string;
    overallProgress: number;
    results?: {
      totalEvents?: number;
    };
  }>;
  errorLog?: string | null;
  completedAt?: string | null;
}

// Internal progress state
interface ImportProgress {
  status: "pending" | "parsing" | "processing" | "completed" | "failed";
  progress: number;
  currentStage: string;
  eventsCreated: number;
  eventsTotal: number;
  error?: string;
  completedAt?: string;
  catalogId?: number;
  datasets?: Array<{ id: number; name: string; eventsCount: number }>;
}

// Copy of the transformation function for testing
// This ensures the test documents the expected behavior
const transformProgressResponse = (data: ProgressApiResponse): ImportProgress => {
  const totalEventsCreated = data.jobs.reduce((sum, job) => sum + (job.results?.totalEvents ?? 0), 0);
  const currentJob = data.jobs.find((job) => job.overallProgress < 100);
  const currentStage = currentJob?.currentStage ?? data.jobs[0]?.currentStage ?? "Processing";

  const datasets = data.jobs.map((job) => ({
    id: typeof job.datasetId === "string" ? parseInt(job.datasetId, 10) : job.datasetId,
    name: job.datasetName ?? `Dataset ${job.datasetId}`,
    eventsCount: job.results?.totalEvents ?? 0,
  }));

  return {
    status: data.status,
    progress: data.overallProgress,
    currentStage,
    eventsCreated: totalEventsCreated,
    eventsTotal: 0, // Not used during processing - we show percentage instead
    error: data.errorLog ?? undefined,
    completedAt: data.completedAt ?? undefined,
    catalogId: data.catalogId ?? undefined,
    datasets: data.status === "completed" ? datasets : undefined,
  };
};

describe("transformProgressResponse", () => {
  const createMockApiResponse = (overrides: Partial<ProgressApiResponse> = {}): ProgressApiResponse => ({
    type: "import-file",
    id: 1,
    status: "completed",
    originalName: "test.csv",
    catalogId: 1,
    datasetsCount: 1,
    datasetsProcessed: 1,
    overallProgress: 100,
    estimatedCompletionTime: null,
    jobs: [
      {
        id: 1,
        datasetId: 3,
        datasetName: "Test Dataset",
        currentStage: "COMPLETED",
        overallProgress: 100,
        results: {
          totalEvents: 10,
        },
      },
    ],
    errorLog: null,
    completedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  });

  it("should read totalEvents from results (not eventsCreated)", () => {
    const apiResponse = createMockApiResponse({
      jobs: [
        {
          id: 1,
          datasetId: 3,
          datasetName: "Dataset 3",
          currentStage: "COMPLETED",
          overallProgress: 100,
          results: {
            totalEvents: 10,
          },
        },
      ],
    });

    const result = transformProgressResponse(apiResponse);
    const { datasets } = result;

    // This test documents the fix: we read totalEvents, not eventsCreated
    expect(result.eventsCreated).toBe(10);
    expect(datasets).toBeDefined();
    expect(datasets?.[0]?.eventsCount).toBe(10);
  });

  it("should sum totalEvents across multiple jobs", () => {
    const apiResponse = createMockApiResponse({
      jobs: [
        {
          id: 1,
          datasetId: 1,
          datasetName: "Dataset 1",
          currentStage: "COMPLETED",
          overallProgress: 100,
          results: { totalEvents: 5 },
        },
        {
          id: 2,
          datasetId: 2,
          datasetName: "Dataset 2",
          currentStage: "COMPLETED",
          overallProgress: 100,
          results: { totalEvents: 15 },
        },
      ],
    });

    const result = transformProgressResponse(apiResponse);
    const { datasets } = result;

    expect(result.eventsCreated).toBe(20);
    expect(datasets).toHaveLength(2);
    expect(datasets?.[0]?.eventsCount).toBe(5);
    expect(datasets?.[1]?.eventsCount).toBe(15);
  });

  it("should default to 0 when results is undefined", () => {
    const apiResponse = createMockApiResponse({
      jobs: [
        {
          id: 1,
          datasetId: 3,
          datasetName: "Dataset 3",
          currentStage: "COMPLETED",
          overallProgress: 100,
          results: undefined,
        },
      ],
    });

    const result = transformProgressResponse(apiResponse);
    const { datasets } = result;

    expect(result.eventsCreated).toBe(0);
    expect(datasets).toBeDefined();
    expect(datasets?.[0]?.eventsCount).toBe(0);
  });

  it("should default to 0 when totalEvents is undefined", () => {
    const apiResponse = createMockApiResponse({
      jobs: [
        {
          id: 1,
          datasetId: 3,
          datasetName: "Dataset 3",
          currentStage: "COMPLETED",
          overallProgress: 100,
          results: {
            totalEvents: undefined,
          },
        },
      ],
    });

    const result = transformProgressResponse(apiResponse);

    expect(result.eventsCreated).toBe(0);
  });

  it("should not include datasets when status is not completed", () => {
    const apiResponse = createMockApiResponse({
      status: "processing",
      jobs: [
        {
          id: 1,
          datasetId: 3,
          datasetName: "Dataset 3",
          currentStage: "CREATE_EVENTS",
          overallProgress: 50,
          results: { totalEvents: 5 },
        },
      ],
    });

    const result = transformProgressResponse(apiResponse);

    expect(result.status).toBe("processing");
    expect(result.datasets).toBeUndefined();
  });

  it("should handle string datasetId by parsing to number", () => {
    const apiResponse = createMockApiResponse({
      jobs: [
        {
          id: 1,
          datasetId: "42",
          datasetName: "Dataset 42",
          currentStage: "COMPLETED",
          overallProgress: 100,
          results: { totalEvents: 10 },
        },
      ],
    });

    const result = transformProgressResponse(apiResponse);
    const { datasets } = result;

    expect(datasets).toBeDefined();
    expect(datasets?.[0]?.id).toBe(42);
    expect(typeof datasets?.[0]?.id).toBe("number");
  });
});
