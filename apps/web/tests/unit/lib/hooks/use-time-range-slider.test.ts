// @vitest-environment jsdom
/**
 * Unit tests for the useTimeRangeSlider hook.
 *
 * Tests position calculations, bar normalization, range checking,
 * and date input handling. DOM-dependent behavior (pointer events,
 * getBoundingClientRect) is not tested here.
 *
 * @module
 * @category Tests
 */
import { act, renderHook } from "@testing-library/react";
import { type ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

// Mock the query hooks
vi.mock("@/lib/hooks/use-events-queries", () => ({
  useFullHistogramQuery: vi.fn(),
  useHistogramQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    isInitialLoad: false,
    isUpdating: false,
    isError: false,
  })),
}));

vi.mock("@/lib/hooks/use-view-scope", () => ({ useViewScope: vi.fn().mockReturnValue("explore") }));

import { useFullHistogramQuery } from "@/lib/hooks/use-events-queries";
import { useTimeRangeSlider } from "@/lib/hooks/use-time-range-slider";

const mockHistogramQuery = vi.mocked(useFullHistogramQuery);

const makeHistogram = (buckets: Array<{ date: string; dateEnd: string; count: number }>) => ({
  histogram: buckets,
  totalCount: buckets.reduce((sum, b) => sum + b.count, 0),
});

const defaultProps = () => ({
  filters: { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} } as Parameters<
    typeof useTimeRangeSlider
  >[0]["filters"],
  onStartDateChange: vi.fn(),
  onEndDateChange: vi.fn(),
});

describe("useTimeRangeSlider", () => {
  describe("empty histogram", () => {
    it("returns zero positions and empty bars when no data", () => {
      mockHistogramQuery.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.normalizedBars).toEqual([]);
      expect(result.current.minTimestamp).toBe(0);
      expect(result.current.maxTimestamp).toBe(0);
      expect(result.current.startPosition).toBe(0);
      expect(result.current.endPosition).toBe(1);
    });
  });

  describe("bar normalization", () => {
    it("normalizes bar heights relative to the maximum count", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-02-01", count: 10 },
        { date: "2024-02-01", dateEnd: "2024-03-01", count: 50 },
        { date: "2024-03-01", dateEnd: "2024-04-01", count: 25 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      expect(result.current.normalizedBars).toHaveLength(3);
      expect(result.current.normalizedBars[0]?.normalizedHeight).toBeCloseTo(0.2); // 10/50
      expect(result.current.normalizedBars[1]?.normalizedHeight).toBeCloseTo(1.0); // 50/50
      expect(result.current.normalizedBars[2]?.normalizedHeight).toBeCloseTo(0.5); // 25/50
    });

    it("handles single bucket", () => {
      const histogram = makeHistogram([{ date: "2024-06-01", dateEnd: "2024-07-01", count: 42 }]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      expect(result.current.normalizedBars).toHaveLength(1);
      expect(result.current.normalizedBars[0]?.normalizedHeight).toBe(1.0);
    });

    it("handles all-zero counts", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-02-01", count: 0 },
        { date: "2024-02-01", dateEnd: "2024-03-01", count: 0 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      expect(result.current.normalizedBars[0]?.normalizedHeight).toBe(0);
      expect(result.current.normalizedBars[1]?.normalizedHeight).toBe(0);
    });
  });

  describe("position calculations", () => {
    const setupWithRange = (startDate: string | null, endDate: string | null) => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-04-01", count: 10 },
        { date: "2024-04-01", dateEnd: "2024-07-01", count: 20 },
        { date: "2024-07-01", dateEnd: "2024-10-01", count: 15 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const base = defaultProps();
      const props = { ...base, filters: { ...base.filters, startDate, endDate } };
      return renderHook(() => useTimeRangeSlider(props));
    };

    it("returns 0 and 1 when no date filters applied", () => {
      const { result } = setupWithRange(null, null);

      expect(result.current.startPosition).toBe(0);
      expect(result.current.endPosition).toBe(1);
    });

    it("calculates mid-range position correctly", () => {
      // Data range: 2024-01-01 to 2024-10-01
      // Set start to approximately the midpoint
      const { result } = setupWithRange("2024-05-15", null);

      expect(result.current.startPosition).toBeGreaterThan(0.4);
      expect(result.current.startPosition).toBeLessThan(0.6);
      expect(result.current.endPosition).toBe(1);
    });

    it("clamps positions to 0-1 range", () => {
      // Date before data range
      const { result } = setupWithRange("2023-01-01", "2025-12-31");

      expect(result.current.startPosition).toBe(0);
      expect(result.current.endPosition).toBe(1);
    });

    it("handles zero-width range (single instant)", () => {
      // Histogram where first bucket date === last bucket dateEnd
      const histogram = makeHistogram([{ date: "2024-06-15", dateEnd: "2024-06-15", count: 5 }]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      // When minTimestamp === maxTimestamp, positions default to 0 and 1
      expect(result.current.startPosition).toBe(0);
      expect(result.current.endPosition).toBe(1);
    });
  });

  describe("isBarInRange", () => {
    it("returns true for bars within selected range", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-04-01", count: 10 },
        { date: "2024-04-01", dateEnd: "2024-07-01", count: 20 },
        { date: "2024-07-01", dateEnd: "2024-10-01", count: 15 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const base = defaultProps();
      const props = { ...base, filters: { ...base.filters, startDate: "2024-03-01", endDate: "2024-08-01" } };
      const { result } = renderHook(() => useTimeRangeSlider(props));

      const bars = result.current.normalizedBars;
      // First bar overlaps with range
      expect(result.current.isBarInRange(bars[0]!.date, bars[0]!.dateEnd)).toBe(true);
      // Second bar is within range
      expect(result.current.isBarInRange(bars[1]!.date, bars[1]!.dateEnd)).toBe(true);
      // Third bar overlaps with range
      expect(result.current.isBarInRange(bars[2]!.date, bars[2]!.dateEnd)).toBe(true);
    });

    it("returns false for bars outside selected range", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-04-01", count: 10 },
        { date: "2024-04-01", dateEnd: "2024-07-01", count: 20 },
        { date: "2024-07-01", dateEnd: "2024-10-01", count: 15 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      // Narrow range that excludes first and last bars
      const base = defaultProps();
      const props = { ...base, filters: { ...base.filters, startDate: "2024-04-15", endDate: "2024-06-15" } };
      const { result } = renderHook(() => useTimeRangeSlider(props));

      const bars = result.current.normalizedBars;
      // First bar ends before range starts
      expect(result.current.isBarInRange(bars[0]!.date, bars[0]!.dateEnd)).toBe(false);
      // Second bar is within range
      expect(result.current.isBarInRange(bars[1]!.date, bars[1]!.dateEnd)).toBe(true);
      // Third bar starts after range ends
      expect(result.current.isBarInRange(bars[2]!.date, bars[2]!.dateEnd)).toBe(false);
    });

    it("includes all bars when no date filter is set", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-06-01", count: 10 },
        { date: "2024-06-01", dateEnd: "2024-12-01", count: 20 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      const bars = result.current.normalizedBars;
      expect(result.current.isBarInRange(bars[0]!.date, bars[0]!.dateEnd)).toBe(true);
      expect(result.current.isBarInRange(bars[1]!.date, bars[1]!.dateEnd)).toBe(true);
    });

    it("handles equal start and end dates", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-04-01", count: 10 },
        { date: "2024-04-01", dateEnd: "2024-07-01", count: 20 },
        { date: "2024-07-01", dateEnd: "2024-10-01", count: 15 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      // startDate === endDate → only bars containing that exact point are in range
      const base = defaultProps();
      const props = { ...base, filters: { ...base.filters, startDate: "2024-05-01", endDate: "2024-05-01" } };
      const { result } = renderHook(() => useTimeRangeSlider(props));

      const bars = result.current.normalizedBars;
      // First bar (Jan-Apr) ends before May 1 → out of range
      expect(result.current.isBarInRange(bars[0]!.date, bars[0]!.dateEnd)).toBe(false);
      // Second bar (Apr-Jul) contains May 1 → in range
      expect(result.current.isBarInRange(bars[1]!.date, bars[1]!.dateEnd)).toBe(true);
      // Third bar (Jul-Oct) starts after May 1 → out of range
      expect(result.current.isBarInRange(bars[2]!.date, bars[2]!.dateEnd)).toBe(false);
    });
  });

  describe("style computations", () => {
    it("computes correct range style from positions", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-07-01", count: 10 },
        { date: "2024-07-01", dateEnd: "2025-01-01", count: 20 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      // No date filter → startPosition=0, endPosition=1
      expect(result.current.rangeStyle.left).toBe("0%");
      expect(result.current.rangeStyle.right).toBe("0%");
    });
  });

  describe("date input handlers", () => {
    it("calls onStartDateChange when start date input changes", () => {
      mockHistogramQuery.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const props = defaultProps();
      const { result } = renderHook(() => useTimeRangeSlider(props));

      act(() => {
        result.current.handleStartDateInputChange({ target: { value: "2024-06-15" } } as ChangeEvent<HTMLInputElement>);
      });

      expect(props.onStartDateChange).toHaveBeenCalledWith("2024-06-15");
    });

    it("calls onEndDateChange with null when input is cleared", () => {
      mockHistogramQuery.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const props = defaultProps();
      const { result } = renderHook(() => useTimeRangeSlider(props));

      act(() => {
        result.current.handleEndDateInputChange({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
      });

      expect(props.onEndDateChange).toHaveBeenCalledWith(null);
    });
  });

  describe("edit mode", () => {
    it("toggles editing state", () => {
      mockHistogramQuery.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const { result } = renderHook(() => useTimeRangeSlider(defaultProps()));

      expect(result.current.isEditingDates).toBe(false);

      act(() => {
        result.current.handleOpenEditMode();
      });
      expect(result.current.isEditingDates).toBe(true);

      act(() => {
        result.current.handleCloseEditMode();
      });
      expect(result.current.isEditingDates).toBe(false);
    });
  });

  describe("keyboard interaction", () => {
    it("moves the start handle backward with ArrowLeft", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-04-01", count: 10 },
        { date: "2024-04-01", dateEnd: "2024-07-01", count: 20 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const props = defaultProps();
      props.filters.startDate = "2024-03-01";

      const { result } = renderHook(() => useTimeRangeSlider(props));
      const preventDefault = vi.fn();

      act(() => {
        result.current.handleHandleKeyDown("start")({ key: "ArrowLeft", preventDefault } as any);
      });

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(props.onStartDateChange).toHaveBeenCalledOnce();
    });

    it("moves the end handle to the maximum with End", () => {
      const histogram = makeHistogram([
        { date: "2024-01-01", dateEnd: "2024-04-01", count: 10 },
        { date: "2024-04-01", dateEnd: "2024-07-01", count: 20 },
      ]);

      mockHistogramQuery.mockReturnValue({ data: histogram, isLoading: false } as unknown as ReturnType<
        typeof useFullHistogramQuery
      >);

      const props = defaultProps();
      props.filters.endDate = "2024-05-01";

      const { result } = renderHook(() => useTimeRangeSlider(props));
      const preventDefault = vi.fn();

      act(() => {
        result.current.handleHandleKeyDown("end")({ key: "End", preventDefault } as any);
      });

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(props.onEndDateChange).toHaveBeenCalledWith("2024-07-01");
    });
  });
});
