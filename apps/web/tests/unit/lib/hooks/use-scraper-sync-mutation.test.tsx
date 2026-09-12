/**
 * Repository sync follows the queued job before refreshing scraper lists.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scraperKeys, useSyncScraperRepoMutation } from "@/lib/hooks/use-scraper-mutations";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/api/http-error", () => mocks);

describe("useSyncScraperRepoMutation", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it.each([false, true])("tracks completion with a previously cached result: %s", async (cached) => {
    mocks.fetchJson.mockResolvedValueOnce({ message: "Queued" }).mockResolvedValueOnce({ pending: true });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    });
    if (cached) client.setQueryData(scraperKeys.sync(7), { pending: false });
    const repos = [...scraperKeys.repos, "user", 42];
    const scrapers = [...scraperKeys.byRepo(), "user", 42];
    client.setQueryData(repos, []);
    client.setQueryData(scrapers, []);
    const { result } = renderHook(useSyncScraperRepoMutation, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(mocks.fetchJson).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.mutateAsync(7);
    });
    await waitFor(() => expect(client.getQueryData(scraperKeys.sync(7))).toEqual({ pending: true }));
    expect(result.current.isPending).toBe(true);
    expect(client.getQueryState(repos)?.isInvalidated).toBe(false);
    expect(client.getQueryState(scrapers)?.isInvalidated).toBe(false);

    mocks.fetchJson.mockResolvedValueOnce({ pending: false });
    await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 7000 });
    expect(client.getQueryState(repos)?.isInvalidated).toBe(true);
    expect(client.getQueryState(scrapers)?.isInvalidated).toBe(true);
    expect(mocks.fetchJson).toHaveBeenNthCalledWith(2, "/api/scraper-repos/7/sync", { credentials: "include" });
    client.clear();
  });
});
