/**
 * Manual start success must not depend on an unrelated follow-up read.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduledIngestKeys, useTriggerScheduledIngestMutation } from "@/lib/hooks/use-scheduled-ingest-mutations";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/api/http-error", () => mocks);

describe("useTriggerScheduledIngestMutation", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  const setup = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = [...scheduledIngestKeys.all, "user", 42];
    client.setQueryData(key, []);
    const { result } = renderHook(useTriggerScheduledIngestMutation, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    return { client, key, result };
  };

  it("invalidates schedule queries after a successful POST without an extra GET", async () => {
    mocks.fetchJson.mockResolvedValueOnce({ message: "Import triggered" }).mockRejectedValue(new Error("Read failed"));
    const { client, key, result } = setup();

    await act(async () => {
      await result.current.mutateAsync(7);
    });

    expect(mocks.fetchJson).toHaveBeenCalledExactlyOnceWith("/api/scheduled-ingests/7/trigger", {
      method: "POST",
      credentials: "include",
    });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });

  it("preserves a failed start as an error without success invalidation", async () => {
    const error = new Error("Import is already running");
    mocks.fetchJson.mockRejectedValue(error);
    const { client, key, result } = setup();

    await act(async () => {
      await expect(result.current.mutateAsync(7)).rejects.toBe(error);
    });

    expect(mocks.fetchJson).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });
});
