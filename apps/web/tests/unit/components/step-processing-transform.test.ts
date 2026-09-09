/**
 * Unit tests for transformProgressResponse in step-processing.
 *
 * Tests the transformation of API response to internal progress state,
 * ensuring field mappings are correct (e.g., results.totalEvents).
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { transformProgressResponse } from "@/lib/ingest/processing-progress";
import type { ProgressApiResponse } from "@/lib/ingest/types/progress-tracking";

describe("transformProgressResponse", () => {
  const createMockApiResponse = (overrides: Partial<ProgressApiResponse> = {}): ProgressApiResponse => ({
    type: "ingest-file",
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
        currentStage: "completed",
        estimatedCompletionTime: null,
        stages: [],
        errors: 0,
        duplicates: { internal: 0, external: 0 },
        overallProgress: 100,
        results: { totalEvents: 10 },
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
          currentStage: "completed",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
          overallProgress: 100,
          results: { totalEvents: 10 },
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

  it("leaves unknown stage and dataset names for localized rendering", () => {
    expect(transformProgressResponse(createMockApiResponse({ jobs: [] })).currentStage).toBeNull();
    const response = createMockApiResponse();
    response.jobs[0]!.datasetName = undefined;
    expect(transformProgressResponse(response).datasets?.[0]?.name).toBeNull();
  });

  it("preserves the review job and its stage progress", () => {
    const response = createMockApiResponse();
    const job = response.jobs[0]!;
    job.reviewReason = "schema-change";
    job.stages = [
      {
        name: "detect-schema",
        displayName: "Detect schema",
        status: "completed",
        progress: 100,
        weight: 1,
        startedAt: null,
        completedAt: null,
        batches: { current: 1, total: 1 },
        currentBatch: { rowsProcessed: 10, rowsTotal: 10, percentage: 100 },
        performance: { rowsPerSecond: null, estimatedSecondsRemaining: null },
      },
    ];
    const result = transformProgressResponse(response);
    expect(result.needsReviewJob).toBe(job);
    expect(result.stages).toEqual(job.stages);
  });

  it("should sum totalEvents across multiple jobs", () => {
    const apiResponse = createMockApiResponse({
      jobs: [
        {
          id: 1,
          datasetId: 1,
          datasetName: "Dataset 1",
          currentStage: "completed",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
          overallProgress: 100,
          results: { totalEvents: 5 },
        },
        {
          id: 2,
          datasetId: 2,
          datasetName: "Dataset 2",
          currentStage: "completed",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
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
          currentStage: "completed",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
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
          currentStage: "completed",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
          overallProgress: 100,
          results: { totalEvents: undefined },
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
          currentStage: "create-events",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
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
          currentStage: "completed",
          estimatedCompletionTime: null,
          stages: [],
          errors: 0,
          duplicates: { internal: 0, external: 0 },
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
