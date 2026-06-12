// @vitest-environment jsdom
/**
 * Regression test for the explorer viewport re-render loop.
 *
 * `simplifyBounds(mapBounds)` used to run unmemoized in the hook body,
 * producing a fresh object every render. `useDebounce` keys its effect on
 * reference identity, so each render re-armed a 300 ms timer whose setState
 * delivered another fresh reference — a self-sustaining ~3.3 Hz re-render
 * loop for the whole explorer tree once the map reported bounds.
 *
 * @module
 * @category Unit Tests
 */
import { act, renderHook } from "@testing-library/react";
import type { LngLatBounds } from "maplibre-gl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExplorerViewport } from "@/app/[locale]/(frontend)/explore/_components/use-explorer-viewport";
import { useUIStore } from "@/lib/store";

const fakeLngLatBounds = {
  getNorth: () => 52.6,
  getSouth: () => 52.4,
  getEast: () => 13.5,
  getWest: () => 13.3,
} as unknown as LngLatBounds;

describe("useExplorerViewport render stability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      useUIStore.getState().setMapBounds(null);
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("settles after a bounds change instead of re-rendering on every debounce tick", () => {
    let renderCount = 0;
    const wrapper = ({ children }: { children: ReactNode }) => <NuqsTestingAdapter>{children}</NuqsTestingAdapter>;

    const { result } = renderHook(
      () => {
        renderCount += 1;
        return useExplorerViewport();
      },
      { wrapper }
    );

    act(() => {
      result.current.handleBoundsChange(fakeLngLatBounds, 10);
    });

    // Let the debounce window elapse a few times over.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const settledCount = renderCount;
    const settledBounds = result.current.debouncedSimpleBounds;

    // With the loop, every additional 300 ms produced another render and a
    // fresh debouncedSimpleBounds identity. Settled means: no further renders
    // and a stable reference.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(renderCount).toBe(settledCount);
    expect(result.current.debouncedSimpleBounds).toBe(settledBounds);
    expect(result.current.debouncedSimpleBounds).toEqual({ north: 52.6, south: 52.4, east: 13.5, west: 13.3 });
  });
});
