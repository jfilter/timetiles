/**
 * Unit tests for useIngestFilesQuery hook.
 *
 * Verifies query key structure and that the query function
 * calls fetchCollectionDocs with the correct endpoint.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { ingestFileKeys } from "@/lib/hooks/use-ingest-files-query";

const mockFetchCollectionDocs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/payload-collection", () => ({ fetchCollectionDocs: mockFetchCollectionDocs }));

// Mock useQuery to capture the queryFn without actually running React hooks
const capturedOptions = vi.hoisted(
  () =>
    ({
      queryFn: null as (() => Promise<unknown>) | null,
      refetchInterval: null as ((query: { state: { data: unknown[] | undefined } }) => number | false) | null,
    }) satisfies {
      queryFn: (() => Promise<unknown>) | null;
      refetchInterval: ((query: { state: { data: unknown[] | undefined } }) => number | false) | null;
    }
);

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: {
    queryFn: () => Promise<unknown>;
    refetchInterval?: (query: { state: { data: unknown[] | undefined } }) => number | false;
  }) => {
    capturedOptions.queryFn = options.queryFn;
    capturedOptions.refetchInterval = options.refetchInterval ?? null;
    return { data: [], isLoading: false };
  },
}));

describe("ingestFileKeys", () => {
  it("should have the correct query key structure", () => {
    expect(ingestFileKeys.all).toEqual(["ingest-files"]);
  });
});

describe("useIngestFilesQuery queryFn", () => {
  it("should call fetchCollectionDocs with the correct endpoint", async () => {
    // Import the hook to trigger the mock capture
    const { useIngestFilesQuery } = await import("@/lib/hooks/use-ingest-files-query");
    useIngestFilesQuery();

    expect(capturedOptions.queryFn).toBeDefined();

    mockFetchCollectionDocs.mockResolvedValue([{ id: 1 }]);
    const result = await capturedOptions.queryFn!();

    expect(mockFetchCollectionDocs).toHaveBeenCalledWith("/api/ingest-files?sort=-createdAt&limit=200");
    expect(result).toEqual([{ id: 1 }]);
  });

  it("should stop polling when a processing import has already settled for review", async () => {
    const { useIngestFilesQuery } = await import("@/lib/hooks/use-ingest-files-query");
    useIngestFilesQuery();

    expect(capturedOptions.refetchInterval).toBeDefined();

    const activePoll = capturedOptions.refetchInterval!({
      state: { data: [{ status: "processing", datasetsCount: 2, datasetsProcessed: 1 }] },
    });
    const settledReviewPoll = capturedOptions.refetchInterval!({
      state: { data: [{ status: "processing", datasetsCount: 2, datasetsProcessed: 2 }] },
    });
    const completedPoll = capturedOptions.refetchInterval!({
      state: { data: [{ status: "completed", datasetsCount: 2, datasetsProcessed: 2 }] },
    });

    expect(activePoll).toBe(5000);
    expect(settledReviewPoll).toBe(false);
    expect(completedPoll).toBe(false);
  });

  it("should keep polling while any import still has background work left", async () => {
    const { useIngestFilesQuery } = await import("@/lib/hooks/use-ingest-files-query");
    useIngestFilesQuery();

    const mixedPoll = capturedOptions.refetchInterval!({
      state: {
        data: [
          { status: "processing", datasetsCount: 2, datasetsProcessed: 2 },
          { status: "processing", datasetsCount: 3, datasetsProcessed: 1 },
        ],
      },
    });

    expect(mixedPoll).toBe(5000);
  });
});
