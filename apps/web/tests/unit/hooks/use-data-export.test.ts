/**
 * Export-card query selection and tracked-property coverage.
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery }));

import type { DataExport } from "@/lib/export/api-types";
import { useLatestExportQuery } from "@/lib/hooks/use-data-export";

const record = (id: number, status: DataExport["status"]): DataExport => ({
  id,
  status,
  requestedAt: "2026-09-07T12:00:00.000Z",
});

describe.sequential("useLatestExportQuery", () => {
  beforeEach(() => vi.clearAllMocks());

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
