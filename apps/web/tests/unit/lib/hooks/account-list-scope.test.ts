/**
 * Personal account lists must retain their owner scope when refetching.
 *
 * @module
 * @category Tests
 */
import { skipToken } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useIngestFilesQuery } from "@/lib/hooks/use-ingest-files-query";
import { useScheduledIngestsQuery } from "@/lib/hooks/use-scheduled-ingests-query";
import { useScraperReposQuery, useScrapersQuery } from "@/lib/hooks/use-scrapers-query";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), fetchCollectionDocs: vi.fn(), useAuthState: vi.fn() }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQuery: mocks.useQuery,
}));
vi.mock("@/lib/api/payload-collection", () => ({ fetchCollectionDocs: mocks.fetchCollectionDocs }));
vi.mock("@/lib/hooks/use-auth-queries", () => ({ useAuthState: mocks.useAuthState }));

describe.each([
  { name: "imports", hook: useIngestFilesQuery, owner: "user", collection: "ingest-files" },
  { name: "schedules", hook: useScheduledIngestsQuery, owner: "createdBy", collection: "scheduled-ingests" },
  { name: "repos", hook: useScraperReposQuery, owner: "createdBy", collection: "scraper-repos" },
  { name: "scrapers", hook: useScrapersQuery, owner: "repoCreatedBy", collection: "scrapers" },
])("Account $name query", ({ hook, owner, collection }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuthState.mockReturnValue({ userId: 42 });
  });

  it("filters by owner and separates users in the cache", async () => {
    hook();
    const options = mocks.useQuery.mock.calls[0]![0];
    await options.queryFn();
    const url = new URL(mocks.fetchCollectionDocs.mock.calls[0]![0], "https://example.test");
    expect(url.pathname).toBe(`/api/${collection}`);
    expect(url.searchParams.get(`where[${owner}][equals]`)).toBe("42");

    mocks.useAuthState.mockReturnValue({ userId: 43 });
    hook();
    expect(mocks.useQuery.mock.calls[1]![0].queryKey).not.toEqual(options.queryKey);
    expect(options.queryKey).toContain(42);
  });

  it("cannot issue an unscoped query without a current user", () => {
    mocks.useAuthState.mockReturnValue({ userId: null });
    hook();
    expect(mocks.useQuery.mock.calls[0]![0].queryFn).toBe(skipToken);
    expect(mocks.fetchCollectionDocs).not.toHaveBeenCalled();
  });
});
