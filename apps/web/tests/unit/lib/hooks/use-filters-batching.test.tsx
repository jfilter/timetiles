/**
 * Filter setters must compose when several fire before the next render.
 *
 * Every setter that reads the current filters and writes them back used the values from the
 * render it was created in. Two interactions inside one tick — two dataset checkboxes, or a
 * field filter plus a range filter — therefore both read the same snapshot, and the second
 * absolute write discarded the first.
 *
 * The stub below mirrors the part of nuqs' contract that matters: `emitter.emit` runs
 * synchronously inside the setter, so `stateRef.current` is already updated when the next
 * call in the same tick runs, and an updater function sees the PENDING state while the
 * rendered value is still stale.
 *
 * @module
 * @category Tests
 */
type NuqsValues = Record<string, unknown>;

const nuqsState: { rendered: NuqsValues; pending: NuqsValues } = vi.hoisted(() => ({
  /** Committed at the last render — what the component closes over. */
  rendered: {},
  /** Updated synchronously on every set — what nuqs hands to an updater. */
  pending: {},
}));

vi.mock("nuqs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useQueryStates: () => [
      nuqsState.rendered,
      (update: unknown) => {
        const patch =
          typeof update === "function" ? (update as (p: NuqsValues) => NuqsValues)(nuqsState.pending) : update;
        Object.assign(nuqsState.pending, patch);
        return Promise.resolve(new URLSearchParams());
      },
    ],
    useQueryState: () => [null, () => Promise.resolve(new URLSearchParams())],
  };
});

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFilters } from "@/lib/hooks/use-filters";

const setNuqsState = (state: Record<string, unknown>): void => {
  nuqsState.rendered = { datasets: [], startDate: null, endDate: null, ff: null, rf: null, ...state };
  nuqsState.pending = { ...nuqsState.rendered };
};

// Sequential: the tests share the nuqs stub's module-level state, and this project runs
// tests inside a file concurrently by default (`sequence.concurrent`).
describe.sequential("useFilters setters within one tick", () => {
  beforeEach(() => {
    setNuqsState({});
  });

  it("keeps both datasets when two toggles fire before a re-render", () => {
    const { result } = renderHook(() => useFilters());

    result.current.toggleDataset("1");
    result.current.toggleDataset("2");

    expect(nuqsState.pending.datasets).toEqual(["1", "2"]);
  });

  it("removes only the toggled dataset when two removals fire together", () => {
    setNuqsState({ datasets: ["1", "2", "3"] });
    const { result } = renderHook(() => useFilters());

    result.current.toggleDataset("1");
    result.current.toggleDataset("3");

    expect(nuqsState.pending.datasets).toEqual(["2"]);
  });

  it("keeps both field filters when two are set before a re-render", () => {
    const { result } = renderHook(() => useFilters());

    result.current.setFieldFilter("city", ["Berlin"]);
    result.current.setFieldFilter("kind", ["talk"]);

    const ff = JSON.parse(String(nuqsState.pending.ff)) as Record<string, string[]>;
    expect(ff).toEqual({ city: ["Berlin"], kind: ["talk"] });
  });

  it("keeps both range filters when two are set before a re-render", () => {
    const { result } = renderHook(() => useFilters());

    result.current.setRangeFilter("price", 1, 2);
    result.current.setRangeFilter("size", 3, 4);

    const rf = JSON.parse(String(nuqsState.pending.rf)) as Record<string, unknown>;
    expect(Object.keys(rf).sort((a, b) => a.localeCompare(b))).toEqual(["price", "size"]);
  });

  it("adds a catalog's datasets on top of a selection made in the same tick", () => {
    const { result } = renderHook(() => useFilters());

    result.current.toggleDataset("9");
    result.current.toggleCatalogDatasets(["1", "2"]);

    expect(nuqsState.pending.datasets).toEqual(["9", "1", "2"]);
  });
});
