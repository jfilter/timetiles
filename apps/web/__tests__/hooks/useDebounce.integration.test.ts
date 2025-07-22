import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "../../lib/hooks/useDebounce";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should return initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 500));

    expect(result.current).toBe("initial");
  });

  test("should debounce value changes", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "initial", delay: 500 },
      },
    );

    expect(result.current).toBe("initial");

    // Update the value
    rerender({ value: "updated", delay: 500 });

    // Value should not change immediately
    expect(result.current).toBe("initial");

    // Fast forward time but not enough
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Still should be the old value
    expect(result.current).toBe("initial");

    // Fast forward past the delay
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Now it should be updated
    expect(result.current).toBe("updated");
  });

  test("should reset timer on rapid changes", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "initial", delay: 500 },
      },
    );

    // Make several rapid changes
    rerender({ value: "change1", delay: 500 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender({ value: "change2", delay: 500 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender({ value: "final", delay: 500 });

    // Should still be initial value
    expect(result.current).toBe("initial");

    // Fast forward past the delay
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should be the final value
    expect(result.current).toBe("final");
  });

  test("should handle different delay values", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "initial", delay: 1000 },
      },
    );

    rerender({ value: "updated", delay: 100 });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("updated");
  });
});
