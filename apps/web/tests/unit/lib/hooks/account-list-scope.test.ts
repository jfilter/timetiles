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

type Initial = { ownerId: number; data: Array<{ id: number }> };
const firstArg = (initial: Initial) => [initial];

describe.each([
  { name: "imports", hook: useIngestFilesQuery, owner: "user", collection: "ingest-files", args: firstArg },
  {
    name: "schedules",
    hook: useScheduledIngestsQuery,
    owner: "createdBy",
    collection: "scheduled-ingests",
    args: firstArg,
  },
  { name: "repos", hook: useScraperReposQuery, owner: "createdBy", collection: "scraper-repos", args: firstArg },
  {
    name: "scrapers",
    hook: useScrapersQuery,
    owner: "repoCreatedBy",
    collection: "scrapers",
    args: (initial: Initial) => [undefined, initial],
  },
])("Account $name query", ({ hook, owner, collection, args }) => {
  const withInitial = (initial: Initial) => (hook as (...params: unknown[]) => unknown)(...args(initial));

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

  it("scopes to the server-rendered owner and keeps its rows while the current user loads", () => {
    const rows = [{ id: 1 }];
    mocks.useAuthState.mockReturnValue({ userId: null, isLoading: true });

    withInitial({ ownerId: 42, data: rows });
    const options = mocks.useQuery.mock.calls[0]![0];

    expect(options.queryFn).not.toBe(skipToken);
    expect(options.queryKey).toContain(42);
    expect(options.initialData).toBe(rows);
  });

  it("drops the server-rendered owner once the session resolves to no user", () => {
    mocks.useAuthState.mockReturnValue({ userId: null, isLoading: false });

    withInitial({ ownerId: 42, data: [{ id: 1 }] });
    const options = mocks.useQuery.mock.calls[0]![0];

    expect(options.queryFn).toBe(skipToken);
    expect(options.queryKey).not.toContain(42);
    expect(options.initialData).toBeUndefined();
  });

  it("drops server rows that belong to a different user than the current one", () => {
    mocks.useAuthState.mockReturnValue({ userId: 43 });

    withInitial({ ownerId: 42, data: [{ id: 1 }] });
    const options = mocks.useQuery.mock.calls[0]![0];

    expect(options.queryKey).toContain(43);
    expect(options.initialData).toBeUndefined();
  });

  it("cannot issue an unscoped query without a current user", () => {
    mocks.useAuthState.mockReturnValue({ userId: null });
    hook();
    expect(mocks.useQuery.mock.calls[0]![0].queryFn).toBe(skipToken);
    expect(mocks.fetchCollectionDocs).not.toHaveBeenCalled();
  });
});
