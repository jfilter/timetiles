/**
 * Unit tests for createItemPollingInterval.
 *
 * Guards against permanently disabled polling when the first fetch fails
 * (e.g. retries exhausted on a 401/429/5xx) before any data has landed.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { createItemPollingInterval } from "@/lib/hooks/query-presets";

describe("createItemPollingInterval", () => {
  const isInProgress = (data: { status: string }) => data.status !== "done";
  const interval = createItemPollingInterval(isInProgress, 2000);

  it("keeps polling after an error with no data yet", () => {
    expect(interval({ state: { data: undefined, status: "error" } })).toBe(2000);
  });

  it("lets the initial fetch happen instead of polling while pending", () => {
    expect(interval({ state: { data: undefined, status: "pending" } })).toBe(false);
  });

  it("polls while the predicate holds on successful data", () => {
    expect(interval({ state: { data: { status: "running" }, status: "success" } })).toBe(2000);
  });

  it("stops polling once the predicate is false", () => {
    expect(interval({ state: { data: { status: "done" }, status: "success" } })).toBe(false);
  });
});
