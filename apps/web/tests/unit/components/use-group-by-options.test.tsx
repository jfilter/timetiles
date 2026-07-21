// @vitest-environment jsdom
/**
 * Regression test for the groupBy option list loading contract.
 *
 * "catalog" only appears once the data-sources query resolves. The explore
 * chart section used to read the in-flight list as authoritative and reset a
 * URL-restored `?groupBy=catalog` to "none" before the data ever arrived, so
 * the hook must report that it is still loading.
 *
 * @module
 * @category Unit Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useGroupByOptions } from "@/components/charts/event-beeswarm";
import { dataSourcesKeys } from "@/lib/hooks/use-data-sources-query";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));

const createWrapper = (seed?: (client: QueryClient) => void) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  });
  seed?.(queryClient);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const twoDatasetsInTwoCatalogs = {
  catalogs: [],
  datasets: [
    { id: 1, name: "A", catalogId: 10 },
    { id: 2, name: "B", catalogId: 20 },
  ],
};

describe("useGroupByOptions", () => {
  it("reports isLoading while the data-sources query is in flight", () => {
    const { result } = renderHook(() => useGroupByOptions(["1", "2"]), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    // The incomplete list is exactly why callers must not act on it yet.
    expect(result.current.options.map((o) => o.value)).not.toContain("catalog");
  });

  it("offers 'catalog' and stops reporting loading once data-sources resolve", () => {
    const wrapper = createWrapper((client) => client.setQueryData(dataSourcesKeys.all, twoDatasetsInTwoCatalogs));
    const { result } = renderHook(() => useGroupByOptions(["1", "2"]), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.options.map((o) => o.value)).toContain("catalog");
  });
});
