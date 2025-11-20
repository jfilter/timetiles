/**
 * Tests for utility functions.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { cn } from "../../src/lib/utils";

describe("cn", () => {
  it("merges class names correctly", () => {
    const result = cn("text-red-500", "bg-blue-500");
    expect(result).toBe("text-red-500 bg-blue-500");
  });

  it("handles conditional class names", () => {
    const result = cn("base-class", true && "conditional-class", false && "hidden-class");
    expect(result).toBe("base-class conditional-class");
  });

  it("handles Tailwind conflicts correctly", () => {
    // Tailwind merge should keep the last conflicting class
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("handles arrays of class names", () => {
    const result = cn(["class-1", "class-2"], "class-3");
    expect(result).toBe("class-1 class-2 class-3");
  });

  it("handles objects with boolean values", () => {
    const result = cn({
      active: true,
      disabled: false,
      focused: true,
    });
    expect(result).toBe("active focused");
  });

  it("handles null and undefined values", () => {
    const result = cn("base-class", null, undefined, "final-class");
    expect(result).toBe("base-class final-class");
  });

  it("handles complex Tailwind conflicts", () => {
    // Should keep the last padding class
    const result = cn("p-4", "p-2", "px-8");
    expect(result).toBe("p-2 px-8");
  });

  it("returns empty string for no arguments", () => {
    const result = cn();
    expect(result).toBe("");
  });

  it("handles mixed input types", () => {
    const result = cn(
      "base-class",
      ["array-class-1", "array-class-2"],
      { "object-class": true, hidden: false },
      null,
      "final-class"
    );
    expect(result).toContain("base-class");
    expect(result).toContain("array-class-1");
    expect(result).toContain("array-class-2");
    expect(result).toContain("object-class");
    expect(result).toContain("final-class");
    expect(result).not.toContain("hidden");
  });
});
