/**
 * Cross-tab synchronization of theme preferences.
 * @module
 * @category Tests
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useThemePreset } from "@/lib/hooks/use-theme-preset";

const STORAGE_KEY = "timetiles-theme-preset";

describe("useThemePreset storage synchronization", () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, "modern"));
  afterEach(() => {
    cleanup();
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.classList.remove("theme-modern");
    document.body.classList.remove("theme-modern");
  });

  it.each([STORAGE_KEY, null])("resets the preset when storage key %s is cleared", (key) => {
    const { result } = renderHook(() => useThemePreset());
    expect(result.current.preset).toBe("modern");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: null, storageArea: localStorage }));
    });
    expect(result.current.preset).toBe("cartographic");
    expect(document.documentElement.classList.contains("theme-modern")).toBe(false);
    expect(document.body.classList.contains("theme-modern")).toBe(false);
  });

  it("ignores another localStorage key", () => {
    const { result } = renderHook(() => useThemePreset());
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", storageArea: localStorage }));
    });
    expect(result.current.preset).toBe("modern");
  });

  it("ignores sessionStorage events for the same key", () => {
    const { result } = renderHook(() => useThemePreset());
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, storageArea: sessionStorage }));
    });
    expect(result.current.preset).toBe("modern");
  });
});
