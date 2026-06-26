/**
 * @module
 */
import { describe, expect, it } from "vitest";

import { defaultIfEmpty } from "@/lib/utils/strings";

describe("defaultIfEmpty", () => {
  it("returns the value when it is a non-empty string", () => {
    expect(defaultIfEmpty("Europe/Berlin", "UTC")).toBe("Europe/Berlin");
  });

  it("keeps whitespace (a space is a valid delimiter, not 'empty')", () => {
    expect(defaultIfEmpty(" ", ",")).toBe(" ");
  });

  it("falls back on empty string, null, and undefined", () => {
    expect(defaultIfEmpty("", "UTC")).toBe("UTC");
    expect(defaultIfEmpty(null, "UTC")).toBe("UTC");
    expect(defaultIfEmpty(undefined, "UTC")).toBe("UTC");
  });
});
