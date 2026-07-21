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

import { useSelectedEvent } from "@/lib/hooks/use-filters";

// Wrapper component with NuqsTestingAdapter
const createWrapper =
  (searchParams?: string) =>
  ({ children }: { children: ReactNode }) => (
    <NuqsTestingAdapter searchParams={searchParams}>{children}</NuqsTestingAdapter>
  );

/**
 * nuqs writes the URL from a queue flushed on a macrotask, and the hook's
 * handlers void the setter's promise, so there is nothing to await directly.
 * Testing Library's `waitFor` does not let that timer run inside a React act
 * environment, so drain a few macrotasks explicitly instead.
 */
const flushUrlUpdates = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
};

// Sequential: the root config sets `sequence.concurrent`, and vitest only reads
// that from the root (a project-level override is ignored). Testing Library
// renders into one shared document and runs a global cleanup() after each test,
// so a concurrent sibling's cleanup unmounts this test's hook mid-await and
// `result.current` becomes null.
describe.sequential("useSelectedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null selectedEventId initially", () => {
    const { result } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper() });

    expect(result.current.selectedEventId).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("should parse event ID from URL", () => {
    const { result } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper("?event=123") });

    expect(result.current.selectedEventId).toBe(123);
    expect(result.current.isOpen).toBe(true);
  });

  it("should open event and update URL", async () => {
    const onUrlUpdate = vi.fn();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>{children}</NuqsTestingAdapter>
    );

    const { result } = renderHook(() => useSelectedEvent(), { wrapper });

    act(() => {
      result.current.openEvent(456);
    });

    await flushUrlUpdates();

    expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0] as UrlUpdateEvent;
    expect(lastCall.queryString).toContain("event=456");
    expect(lastCall.searchParams.get("event")).toBe("456");
    // history: "push" keeps the browser back button working for the modal
    expect(lastCall.options.history).toBe("push");
  });

  it("should close event and clear URL param", async () => {
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

    await flushUrlUpdates();

    expect(onUrlUpdate).toHaveBeenCalled();
    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0] as UrlUpdateEvent;
    // The param must be removed, not merely rewritten to some other value.
    expect(lastCall.searchParams.get("event")).toBeNull();
    expect(lastCall.queryString).not.toContain("event=");
  });

  it("should handle non-numeric event param gracefully", () => {
    const { result } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper("?event=abc") });

    // parseAsInteger should return null for invalid values
    expect(result.current.selectedEventId).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("should handle empty event param", () => {
    const { result } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper("?event=") });

    expect(result.current.selectedEventId).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("should preserve other URL params when opening event", async () => {
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

    await flushUrlUpdates();

    expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0] as UrlUpdateEvent;
    // Should contain the new event param
    expect(lastCall.searchParams.get("event")).toBe("789");
    // Should preserve existing params
    expect(lastCall.searchParams.get("catalog")).toBe("1");
    expect(lastCall.searchParams.get("datasets")).toBe("2");
  });

  it("openEvent and closeEvent should be stable references", () => {
    const { result, rerender } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper() });

    const initialOpenEvent = result.current.openEvent;
    const initialCloseEvent = result.current.closeEvent;

    rerender();

    expect(result.current.openEvent).toBe(initialOpenEvent);
    expect(result.current.closeEvent).toBe(initialCloseEvent);
  });

  it("should handle negative event ID", () => {
    const { result } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper("?event=-1") });

    // parseAsInteger should parse negative numbers
    expect(result.current.selectedEventId).toBe(-1);
    expect(result.current.isOpen).toBe(true);
  });

  it("should handle zero event ID", () => {
    const { result } = renderHook(() => useSelectedEvent(), { wrapper: createWrapper("?event=0") });

    // 0 is a valid integer
    expect(result.current.selectedEventId).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });
});
