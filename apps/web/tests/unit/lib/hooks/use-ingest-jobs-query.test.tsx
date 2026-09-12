/**
 * Job details poll through initial creation and stop once processing settles.
 *
 * @module
 * @category Tests
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIngestJobsByFileQuery } from "@/lib/hooks/use-ingest-jobs-query";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), client: { invalidateQueries: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery, useQueryClient: () => mocks.client }));

describe("useIngestJobsByFileQuery polling", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("polls while the file is active, including before jobs exist", () => {
    renderHook(() => useIngestJobsByFileQuery(7, true));
    expect(mocks.useQuery.mock.lastCall?.[0].refetchInterval).toBe(5000);
  });

  it.each([
    [undefined, false],
    [[], false],
    [[{ stage: "completed" }], false],
    [[{ stage: "failed" }], false],
    [[{ stage: "needs-review" }], false],
    [[{ stage: "geocode-batch" }], 5000],
    [[{ stage: "completed" }, { stage: "create-events" }], 5000],
  ])("uses job state after the file settles: %j", (data, interval) => {
    renderHook(() => useIngestJobsByFileQuery(7, false));
    const options = mocks.useQuery.mock.lastCall?.[0];
    expect(options.refetchInterval({ state: { data } })).toBe(interval);
  });

  it("does not fetch without a file id", () => {
    renderHook(() => useIngestJobsByFileQuery(null, true));
    expect(mocks.useQuery.mock.lastCall?.[0].enabled).toBe(false);
  });
});
