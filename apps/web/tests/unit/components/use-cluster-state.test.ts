// @vitest-environment jsdom
/**
 * Unit tests for the transition state reported by useClusterState.
 *
 * @module
 * @category Unit Tests
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClusterFeature } from "@/components/maps/clustered-map";
import { useClusterState } from "@/components/maps/use-cluster-state";
import { TRANSITION_DURATION } from "@/components/maps/use-transition-animation";

const clusterAt = (lng: number): ClusterFeature[] => [
  {
    type: "Feature",
    id: "cell-a",
    geometry: { type: "Point", coordinates: [lng, 0] },
    properties: { type: "event-cluster", count: 3 },
  },
];

describe("useClusterState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a transition from new clusters until they reach their positions", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const first = clusterAt(0);
    const { result, rerender } = renderHook(({ clusters }) => useClusterState(clusters), {
      initialProps: { clusters: first },
    });
    expect(result.current.isTransitioning).toBe(false);

    const second = clusterAt(10);
    rerender({ clusters: second });
    expect(result.current.isTransitioning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(TRANSITION_DURATION / 2);
    });
    expect(result.current.isTransitioning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(TRANSITION_DURATION);
    });
    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.animatedClusters).toBe(second);
  });
});
