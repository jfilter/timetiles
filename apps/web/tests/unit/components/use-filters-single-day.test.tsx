// @vitest-environment jsdom
/**
 * Regression test for setBucketRangeFilter timezone handling and bucket ranges.
 *
 * A histogram bar-click must filter the same calendar day(s) the time-range slider
 * would (the slider uses formatISODate = UTC) and that the UTC-based histogram
 * buckets / timestamptz date filters use. The old implementation used
 * formatLocalISODate, which shifted the filtered day by one in non-UTC zones.
 *
 * It must also commit the full clicked bucket's [start, end) range — not always
 * collapse to a single day — since buckets are adaptive (hour/day/month/year).
 *
 * @module
 * @category Unit Tests
 */
import { act, renderHook } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { useFilters } from "@/lib/hooks/use-filters";

/**
 * nuqs writes the URL from a queue flushed on a macrotask, and the hook's
 * handlers void the setter's promise, so there is nothing to await directly.
 * Testing Library's `waitFor` does not let that timer run inside a React act
 * environment, so drain a few macrotasks explicitly instead.
 */
const flushUrlUpdates = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
};

// Sequential: the root config sets `sequence.concurrent`, and a concurrent
// sibling's cleanup unmounts this test's hook mid-await (see
// use-selected-event.test.tsx for the same fix).
describe.sequential("useFilters.setBucketRangeFilter timezone handling", () => {
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
    const clickedDay = new Date("2024-01-15T02:00:00.000Z");
    act(() => {
      result.current.setBucketRangeFilter(clickedDay, clickedDay);
    });
    await flushUrlUpdates();

    expect(onUrlUpdate).toHaveBeenCalled();
    const lastCall = onUrlUpdate.mock.calls.at(-1)![0] as UrlUpdateEvent;
    // UTC day is 2024-01-15. The old local-day formatting produced 2024-01-14.
    expect(lastCall.queryString).toContain("startDate=2024-01-15");
    expect(lastCall.queryString).toContain("endDate=2024-01-15");
    expect(lastCall.queryString).not.toContain("2024-01-14");
  });

  it("filters the full clicked bucket's range for a multi-day (e.g. month) bucket", async () => {
    const onUrlUpdate = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>{children}</NuqsTestingAdapter>
    );

    const { result } = renderHook(() => useFilters(), { wrapper });

    // A monthly bucket: Jan 2025, exclusive end at the start of Feb 2025.
    const bucketStart = new Date("2025-01-01T00:00:00.000Z");
    const bucketEnd = new Date("2025-02-01T00:00:00.000Z");
    act(() => {
      result.current.setBucketRangeFilter(bucketStart, bucketEnd);
    });
    await flushUrlUpdates();

    expect(onUrlUpdate).toHaveBeenCalled();
    const lastCall = onUrlUpdate.mock.calls.at(-1)![0] as UrlUpdateEvent;
    // The exclusive end boundary (Feb 1) steps back to the bucket's last
    // included calendar day (Jan 31), not the single day Jan 1.
    expect(lastCall.queryString).toContain("startDate=2025-01-01");
    expect(lastCall.queryString).toContain("endDate=2025-01-31");
  });
});
