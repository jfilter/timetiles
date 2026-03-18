// @vitest-environment jsdom
/**
 * Unit tests for debounce hooks.
 *
 * Tests the useDebounce hook to ensure proper debouncing behavior and timer handling.
 *
 * @module
 * @category Tests
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebounce } from "../../../../lib/hooks/use-debounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should return initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 500));

    expect(result.current).toBe("initial");
  });

  it("should debounce string value changes", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial", delay: 500 },
    });

    expect(result.current).toBe("initial");

    // Change value
    rerender({ value: "changed", delay: 500 });

    // Value should not update immediately
    expect(result.current).toBe("initial");

    // Advance timers and trigger updates
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe("changed");
  });

  it("should debounce number value changes", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 0, delay: 300 },
    });

    expect(result.current).toBe(0);

    rerender({ value: 42, delay: 300 });
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(42);
  });

  it("should debounce boolean value changes", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: false, delay: 200 },
    });

    expect(result.current).toBe(false);

    rerender({ value: true, delay: 200 });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe(true);
  });

  it("should debounce object value changes", () => {
    const initialObj = { name: "Alice", age: 30 };
    const changedObj = { name: "Bob", age: 25 };

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: initialObj, delay: 500 },
    });

    expect(result.current).toEqual(initialObj);

    rerender({ value: changedObj, delay: 500 });
    expect(result.current).toEqual(initialObj);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toEqual(changedObj);
  });

  it("should reset debounce timer on rapid value changes", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial", delay: 500 },
    });

    // Change value multiple times rapidly
    rerender({ value: "change1", delay: 500 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("initial");

    rerender({ value: "change2", delay: 500 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("initial");

    rerender({ value: "change3", delay: 500 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("initial");

    // Finally let timer complete
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("change3");
  });

  it("should handle delay changes", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial", delay: 500 },
    });

    rerender({ value: "changed", delay: 200 });
    expect(result.current).toBe("initial");

    // New delay should be used
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe("changed");
  });

  it("should cleanup timeout on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const { unmount } = renderHook(() => useDebounce("initial", 500));

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("should handle null values", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial" as string | null, delay: 300 },
    });

    rerender({ value: null, delay: 300 });
    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBeNull();
  });

  it("should handle undefined values", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial" as string | undefined, delay: 300 },
    });

    rerender({ value: undefined, delay: 300 });
    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBeUndefined();
  });

  it("should handle array values", () => {
    const initialArray = [1, 2, 3];
    const changedArray = [4, 5, 6];

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: initialArray, delay: 300 },
    });

    rerender({ value: changedArray, delay: 300 });
    expect(result.current).toEqual(initialArray);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toEqual(changedArray);
  });
});
