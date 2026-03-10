// @vitest-environment jsdom
/**
 * Unit tests for event query hooks.
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useImportUploadMutation } from "@/lib/hooks/use-events-queries";

const createWrapper =
  () =>
  ({ children }: { children: ReactNode }) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };

describe.sequential("useImportUploadMutation", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      // oxlint-disable-next-line promise/prefer-await-to-then -- Mock response object
      json: () => Promise.resolve({ id: "import-123" }),
    } as Response);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not coerce partially numeric catalog ids into upload payloads", async () => {
    const { result } = renderHook(() => useImportUploadMutation(), {
      wrapper: createWrapper(),
    });

    const formData = new FormData();
    formData.append("file", new File(["id,title\n1,Test"], "events.csv", { type: "text/csv" }));
    formData.append("catalogId", "123abc");

    await act(async () => {
      await result.current.mutateAsync({ formData });
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse((options.body as FormData).get("_payload") as string) as {
      catalog?: number;
    };

    expect(payload.catalog).toBeUndefined();
  });
});
