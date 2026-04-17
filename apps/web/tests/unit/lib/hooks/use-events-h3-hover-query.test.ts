/**
 * Unit tests for H3 hover query setup.
 *
 * Verifies hover params are built lazily so server renders without an active
 * hover target do not touch browser-derived state.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const capturedOptions = vi.hoisted(() => ({ latest: null as { enabled: boolean; queryKey: unknown[] } | null }));

const mockUseQuery = vi.hoisted(() =>
  vi.fn((options: { enabled: boolean; queryKey: unknown[] }) => {
    capturedOptions.latest = options;
    return { data: undefined, error: null, isLoading: false };
  })
);

vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: vi.fn(), useQuery: mockUseQuery }));

describe("useH3HoverChildrenQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions.latest = null;
  });

  it("skips param building until a hover target exists", async () => {
    const buildParams = vi.fn(() => new URLSearchParams("catalog=7"));
    const { useH3HoverChildrenQuery } = await import("@/lib/hooks/use-events-queries");

    useH3HoverChildrenQuery(null, [], 8, "none", buildParams, true);

    expect(buildParams).not.toHaveBeenCalled();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(capturedOptions.latest).not.toBeNull();
    expect(capturedOptions.latest!.enabled).toBe(false);
    expect(capturedOptions.latest!.queryKey.at(-1)).toBe("");
  });

  it("builds params for active hover targets and includes them in the query key", async () => {
    const buildParams = vi.fn(() => new URLSearchParams("catalog=7&datasets=10"));
    const { useH3HoverChildrenQuery } = await import("@/lib/hooks/use-events-queries");

    useH3HoverChildrenQuery("cluster-1", ["cell-1"], 8, "bounds", buildParams, true);

    expect(buildParams).toHaveBeenCalledTimes(1);
    expect(capturedOptions.latest).not.toBeNull();
    expect(capturedOptions.latest!.enabled).toBe(true);
    expect(capturedOptions.latest!.queryKey.at(-1)).toBe("catalog=7&datasets=10");
  });
});
