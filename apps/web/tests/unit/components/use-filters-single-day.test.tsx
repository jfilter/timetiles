// @vitest-environment jsdom
/**
 * Regression test for setSingleDayFilter timezone handling.
 *
 * A histogram bar-click must filter the same calendar day the time-range slider
 * would (the slider uses formatISODate = UTC) and that the UTC-based histogram
 * buckets / timestamptz date filters use. The old implementation used
 * formatLocalISODate, which shifted the filtered day by one in non-UTC zones.
 *
 * @module
 * @category Unit Tests
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { useFilters } from "@/lib/hooks/use-filters";

describe("useFilters.setSingleDayFilter timezone handling", () => {
  beforeAll(() => {
    // Negative-offset zone so a small-hours-UTC instant falls on the previous
    // local calendar day — exactly where the local-day bug manifested.
    vi.stubEnv("TZ", "America/New_York");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("filters the UTC calendar day of the clicked bucket, not the local day", async () => {
    const onUrlUpdate = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>{children}</NuqsTestingAdapter>
    );

    const { result } = renderHook(() => useFilters(), { wrapper });

    // 02:00 UTC on Jan 15 == 21:00 on Jan 14 in America/New_York.
    act(() => {
      result.current.setSingleDayFilter(new Date("2024-01-15T02:00:00.000Z"));
    });

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const lastCall = onUrlUpdate.mock.calls.at(-1)![0] as UrlUpdateEvent;
    // UTC day is 2024-01-15. The old local-day formatting produced 2024-01-14.
    expect(lastCall.queryString).toContain("startDate=2024-01-15");
    expect(lastCall.queryString).toContain("endDate=2024-01-15");
    expect(lastCall.queryString).not.toContain("2024-01-14");
  });
});
