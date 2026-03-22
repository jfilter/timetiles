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
const capturedOptions = vi.hoisted(() => ({ queryFn: null as (() => Promise<unknown>) | null }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryFn: () => Promise<unknown> }) => {
    capturedOptions.queryFn = options.queryFn;
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
});
