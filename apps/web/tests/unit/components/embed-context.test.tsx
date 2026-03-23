/**
 * Tests for the embed context provider and hook.
 *
 * Verifies that EmbedProvider signals embed mode to child components
 * and that useIsEmbed returns false outside the provider.
 *
 * @module
 * @category Tests
 */
// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmbedProvider, useIsEmbed } from "@/lib/context/embed-context";

describe("embed context", () => {
  it("returns false by default (outside provider)", () => {
    const { result } = renderHook(() => useIsEmbed());
    expect(result.current).toBe(false);
  });

  it("returns true inside EmbedProvider", () => {
    const { result } = renderHook(() => useIsEmbed(), {
      wrapper: ({ children }) => <EmbedProvider>{children}</EmbedProvider>,
    });
    expect(result.current).toBe(true);
  });
});
