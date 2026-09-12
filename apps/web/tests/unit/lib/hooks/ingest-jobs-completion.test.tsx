/**
 * A file settling between polls must trigger one final job-detail fetch.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useIngestJobsByFileQuery } from "@/lib/hooks/use-ingest-jobs-query";

const mocks = vi.hoisted(() => ({ fetchCollectionDocs: vi.fn() }));
vi.mock("@/lib/api/payload-collection", () => mocks);
afterEach(cleanup);

it("loads final jobs when the file settles before the next polling tick", async () => {
  const completed = [{ id: 1, stage: "completed" }];
  mocks.fetchCollectionDocs.mockResolvedValueOnce([]).mockResolvedValue(completed);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, rerender } = renderHook(({ active }) => useIngestJobsByFileQuery(7, active), {
    initialProps: { active: true },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.data).toEqual([]));
  rerender({ active: false });
  await waitFor(() => expect(result.current.data).toEqual(completed));
  expect(mocks.fetchCollectionDocs).toHaveBeenCalledTimes(2);
  client.clear();
});
