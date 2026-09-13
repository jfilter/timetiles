/**
 * Tests for the built-in UI texts supplied through UIProvider.
 *
 * @module
 */
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { UIProvider, useUILabels } from "../provider";

describe("useUILabels", () => {
  it("returns English defaults without a provider", () => {
    const { result } = renderHook(() => useUILabels());

    expect(result.current.tryAgain).toBe("Try again");
    expect(result.current.pageOf(2, 5)).toBe("Page 2 of 5");
  });

  it("merges provided labels over the English defaults", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UIProvider labels={{ tryAgain: "Erneut versuchen" }}>{children}</UIProvider>
    );
    const { result } = renderHook(() => useUILabels(), { wrapper });

    expect(result.current.tryAgain).toBe("Erneut versuchen");
    expect(result.current.cancel).toBe("Cancel");
  });
});
