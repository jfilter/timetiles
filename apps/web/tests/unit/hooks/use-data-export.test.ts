/**
 * Export-card query selection and tracked-property coverage.
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useQuery, useAuthState, fetchJson, skipToken } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useAuthState: vi.fn(),
  fetchJson: vi.fn(),
  skipToken: Symbol("skipToken"),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery, skipToken }));
vi.mock("@/lib/hooks/use-auth-queries", () => ({ useAuthState }));
vi.mock("@/lib/api/http-error", () => ({ fetchJson }));

import type { DataExport } from "@/lib/export/api-types";
import { useLatestExportQuery } from "@/lib/hooks/use-data-export";

const record = (id: number, status: DataExport["status"]): DataExport => ({
  id,
  status,
  requestedAt: "2026-09-07T12:00:00.000Z",
});

describe.sequential("useLatestExportQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthState.mockReturnValue({ userId: 1, isLoading: false });
  });

  it("filters account exports by the current user, including administrators", async () => {
    useAuthState.mockReturnValue({ userId: 42, isLoading: false, user: { id: 42, role: "admin" } });
    useQuery.mockReturnValue({ data: undefined, isLoading: true });
    fetchJson.mockResolvedValue({ docs: [], totalDocs: 0 });
    useLatestExportQuery();
    const options = useQuery.mock.calls[0]![0];
    expect(options.queryKey).toEqual(["data-exports", "list", 42]);
    await options.queryFn();
    const url = new URL(fetchJson.mock.calls[0]![0], "http://localhost");
    expect(url.searchParams.get("where[user][equals]")).toBe("42");

    useAuthState.mockReturnValue({ userId: 43, isLoading: false });
    useLatestExportQuery();
    expect(useQuery.mock.calls[1]![0].queryKey).toEqual(["data-exports", "list", 43]);
  });

  it("does not fetch exports while the current user is unknown", () => {
    useAuthState.mockReturnValue({ userId: null, isLoading: true });
    useQuery.mockReturnValue({ data: undefined, isLoading: false });
    expect(useLatestExportQuery()).toEqual({ latestExport: undefined, isLoading: true });
    expect(useQuery.mock.calls[0]![0].queryFn).toBe(skipToken);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it.each(["pending", "processing", "ready"] as const)(
    "selects the newest %s export over a failed record",
    (status) => {
      const selected = record(2, status);
      useQuery.mockReturnValue({
        data: { exports: [record(3, "failed"), selected, record(1, "ready")] },
        isLoading: false,
      });
      expect(useLatestExportQuery()).toEqual({ latestExport: selected, isLoading: false });
    }
  );

  it("falls back to the newest record when none is active or ready", () => {
    const selected = record(2, "failed");
    useQuery.mockReturnValue({ data: { exports: [selected, record(1, "expired")] }, isLoading: false });
    expect(useLatestExportQuery()).toEqual({ latestExport: selected, isLoading: false });
  });

  it.each([undefined, { exports: [] }])("handles an absent or empty list", (data) => {
    useQuery.mockReturnValue({ data, isLoading: data === undefined });
    expect(useLatestExportQuery()).toEqual({ latestExport: undefined, isLoading: data === undefined });
  });

  it("does not subscribe the card to unrelated query properties", () => {
    const isFetching = vi.fn(() => false);
    useQuery.mockReturnValue({
      data: { exports: [] },
      isLoading: false,
      get isFetching() {
        return isFetching();
      },
    });
    useLatestExportQuery();
    expect(isFetching).not.toHaveBeenCalled();
  });
});
