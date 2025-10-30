/**
 * Unit tests for debounce hooks.
 *
 * Tests the useDebounce and useDebounceWithComparison hooks to ensure
 * proper debouncing behavior, timer handling, and custom comparison logic.
 *
 * @module
 * @category Tests
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebounce, useDebounceWithComparison } from "../../../../lib/hooks/use-debounce";

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
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

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

describe("useDebounceWithComparison", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should return initial value immediately", () => {
    const { result } = renderHook(() => useDebounceWithComparison("initial", 500));

    expect(result.current).toBe("initial");
  });

  it("should debounce value changes without comparison function", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounceWithComparison(value, delay), {
      initialProps: { value: "initial", delay: 500 },
    });

    expect(result.current).toBe("initial");

    rerender({ value: "changed", delay: 500 });
    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe("changed");
  });

  it("should use custom comparison function when provided", () => {
    const compare = (prev: { id: number; name: string }, next: { id: number; name: string }) => prev.id === next.id;

    const obj1 = { id: 1, name: "Alice" };
    const obj2 = { id: 1, name: "Bob" }; // Same id, different name
    const obj3 = { id: 2, name: "Charlie" }; // Different id

    const { result, rerender } = renderHook(
      ({ value, delay, compareFn }) => useDebounceWithComparison(value, delay, compareFn),
      {
        initialProps: { value: obj1, delay: 500, compareFn: compare },
      }
    );

    expect(result.current).toEqual(obj1);

    // Change to obj2 (same id, should not update due to comparison)
    rerender({ value: obj2, delay: 500, compareFn: compare });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should still be obj1 because comparison returned true (same id)
    expect(result.current).toEqual(obj1);

    // Change to obj3 (different id, should update)
    rerender({ value: obj3, delay: 500, compareFn: compare });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toEqual(obj3);
  });

  it("should update when comparison function returns false", () => {
    const compare = (prev: string, next: string) => prev === next;

    const { result, rerender } = renderHook(
      ({ value, delay, compareFn }) => useDebounceWithComparison(value, delay, compareFn),
      {
        initialProps: { value: "initial", delay: 300, compareFn: compare },
      }
    );

    rerender({ value: "changed", delay: 300, compareFn: compare });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("changed");
  });

  it("should not update when comparison function returns true", () => {
    const compare = () => true; // Always returns true (values are "equal")

    const { result, rerender } = renderHook(
      ({ value, delay, compareFn }) => useDebounceWithComparison(value, delay, compareFn),
      {
        initialProps: { value: "initial", delay: 300, compareFn: compare },
      }
    );

    rerender({ value: "changed", delay: 300, compareFn: compare });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should still be initial because comparison said they're equal
    expect(result.current).toBe("initial");
  });

  it("should handle deep object comparison", () => {
    const deepCompare = (prev: { user: { id: number; name: string } }, next: { user: { id: number; name: string } }) =>
      prev.user.id === next.user.id && prev.user.name === next.user.name;

    const obj1 = { user: { id: 1, name: "Alice" } };
    const obj2 = { user: { id: 1, name: "Alice" } }; // Deep equal
    const obj3 = { user: { id: 1, name: "Bob" } }; // Different name

    const { result, rerender } = renderHook(
      ({ value, delay, compareFn }) => useDebounceWithComparison(value, delay, compareFn),
      {
        initialProps: { value: obj1, delay: 300, compareFn: deepCompare },
      }
    );

    // Change to obj2 (deep equal, should not update)
    rerender({ value: obj2, delay: 300, compareFn: deepCompare });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toEqual(obj1);

    // Change to obj3 (different name, should update)
    rerender({ value: obj3, delay: 300, compareFn: deepCompare });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toEqual(obj3);
  });

  it("should cleanup timeout on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = renderHook(() => useDebounceWithComparison("initial", 500));

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("should handle comparison function changes", () => {
    const compare1 = () => true;
    const compare2 = () => false;

    const { result, rerender } = renderHook(
      ({ value, delay, compareFn }) => useDebounceWithComparison(value, delay, compareFn),
      {
        initialProps: { value: "initial", delay: 300, compareFn: compare1 },
      }
    );

    rerender({ value: "changed", delay: 300, compareFn: compare2 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should update because new comparison function returns false
    expect(result.current).toBe("changed");
  });

  it("should work without comparison function (default behavior)", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounceWithComparison(value, delay, undefined), {
      initialProps: { value: 10, delay: 300 },
    });

    rerender({ value: 20, delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(20);
  });

  it("should handle rapid changes with comparison", () => {
    const compare = (prev: number, next: number) => Math.abs(prev - next) < 5;

    const { result, rerender } = renderHook(
      ({ value, delay, compareFn }) => useDebounceWithComparison(value, delay, compareFn),
      {
        initialProps: { value: 10, delay: 300, compareFn: compare },
      }
    );

    // Change to 12 (within 5, should not update)
    rerender({ value: 12, delay: 300, compareFn: compare });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(10);

    // Change to 20 (difference > 5, should update)
    rerender({ value: 20, delay: 300, compareFn: compare });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(20);
  });
});
