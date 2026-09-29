// @vitest-environment jsdom
/**
 * Unit tests for the initial fit state of useExplorerViewport.
 *
 * @module
 * @category Unit Tests
 */
import { renderHook } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useExplorerViewport } from "@/app/[locale]/(frontend)/explore/_components/use-explorer-viewport";

const wrapper = ({ children }: { children: ReactNode }) => <NuqsTestingAdapter>{children}</NuqsTestingAdapter>;

describe("useExplorerViewport", () => {
  it("leaves a view from the URL in place of the initial fit to the data", () => {
    const { result } = renderHook(() => useExplorerViewport({ hasInitialViewState: true }), { wrapper });

    expect(result.current.boundsState).toBe("bounds-applied");
  });

  it("fits to the data initially when the URL has no view", () => {
    const { result } = renderHook(() => useExplorerViewport(), { wrapper });

    expect(result.current.boundsState).toBe("initial");
  });
});
