// @vitest-environment jsdom
/**
 * Unit tests for useSelectedEvent hook.
 *
 * Tests the URL-based event selection state management hook
 * used for modal permalinks in the explore page.
 *
 * @module
 * @category Tests
 */
import { act, renderHook } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectedEvent } from "@/lib/filters";

// Wrapper component with NuqsTestingAdapter
const createWrapper =
  (searchParams?: string) =>
  ({ children }: { children: ReactNode }) => (
    <NuqsTestingAdapter searchParams={searchParams}>{children}</NuqsTestingAdapter>
  );

describe("useSelectedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null selectedEventId initially", () => {
    const { result } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper(),
    });

    expect(result.current.selectedEventId).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("should parse event ID from URL", () => {
    const { result } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper("?event=123"),
    });

    expect(result.current.selectedEventId).toBe(123);
    expect(result.current.isOpen).toBe(true);
  });

  it("should open event and update URL", () => {
    const onUrlUpdate = vi.fn();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>{children}</NuqsTestingAdapter>
    );

    const { result } = renderHook(() => useSelectedEvent(), { wrapper });

    act(() => {
      result.current.openEvent(456);
    });

    expect(onUrlUpdate).toHaveBeenCalled();
    const lastCallArgs = onUrlUpdate.mock.calls[onUrlUpdate.mock.calls.length - 1];
    expect(lastCallArgs).toBeDefined();
    const lastCall = lastCallArgs![0] as UrlUpdateEvent;
    expect(lastCall.queryString).toContain("event=456");
  });

  it("should close event and clear URL param", () => {
    const onUrlUpdate = vi.fn();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter searchParams="?event=123" onUrlUpdate={onUrlUpdate}>
        {children}
      </NuqsTestingAdapter>
    );

    const { result } = renderHook(() => useSelectedEvent(), { wrapper });

    // Initially should be open
    expect(result.current.selectedEventId).toBe(123);
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closeEvent();
    });

    expect(onUrlUpdate).toHaveBeenCalled();
  });

  it("should handle non-numeric event param gracefully", () => {
    const { result } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper("?event=abc"),
    });

    // parseAsInteger should return null for invalid values
    expect(result.current.selectedEventId).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("should handle empty event param", () => {
    const { result } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper("?event="),
    });

    expect(result.current.selectedEventId).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("should preserve other URL params when opening event", () => {
    const onUrlUpdate = vi.fn();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter searchParams="?catalog=1&datasets=2" onUrlUpdate={onUrlUpdate}>
        {children}
      </NuqsTestingAdapter>
    );

    const { result } = renderHook(() => useSelectedEvent(), { wrapper });

    act(() => {
      result.current.openEvent(789);
    });

    expect(onUrlUpdate).toHaveBeenCalled();
    const lastCallArgs = onUrlUpdate.mock.calls[onUrlUpdate.mock.calls.length - 1];
    expect(lastCallArgs).toBeDefined();
    const lastCall = lastCallArgs![0] as UrlUpdateEvent;
    // Should contain the new event param
    expect(lastCall.queryString).toContain("event=789");
    // Should preserve existing params
    expect(lastCall.queryString).toContain("catalog=1");
    expect(lastCall.queryString).toContain("datasets=2");
  });

  it("openEvent and closeEvent should be stable references", () => {
    const { result, rerender } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper(),
    });

    const initialOpenEvent = result.current.openEvent;
    const initialCloseEvent = result.current.closeEvent;

    rerender();

    expect(result.current.openEvent).toBe(initialOpenEvent);
    expect(result.current.closeEvent).toBe(initialCloseEvent);
  });

  it("should handle negative event ID", () => {
    const { result } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper("?event=-1"),
    });

    // parseAsInteger should parse negative numbers
    expect(result.current.selectedEventId).toBe(-1);
    expect(result.current.isOpen).toBe(true);
  });

  it("should handle zero event ID", () => {
    const { result } = renderHook(() => useSelectedEvent(), {
      wrapper: createWrapper("?event=0"),
    });

    // 0 is a valid integer
    expect(result.current.selectedEventId).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });
});
