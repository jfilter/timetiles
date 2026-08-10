/**
 * Unit tests for the deterministic comparators.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { compareCodeUnits, stableStringify } from "@/lib/utils/compare";

describe("compareCodeUnits", () => {
  it("orders by UTF-16 code unit, not by locale", () => {
    expect(compareCodeUnits("a", "b")).toBe(-1);
    expect(compareCodeUnits("b", "a")).toBe(1);
    expect(compareCodeUnits("a", "a")).toBe(0);
    // Locale-aware ordering would sort "ä" next to "a"; code-unit ordering puts it after "z".
    expect(compareCodeUnits("ä", "z")).toBe(1);
  });
});

describe("stableStringify", () => {
  it("emits the same string regardless of key insertion order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts nested objects too, and preserves array order", () => {
    expect(stableStringify({ outer: { z: 1, a: [3, 1, 2] } })).toBe('{"outer":{"a":[3,1,2],"z":1}}');
  });

  it("drops a literal __proto__ key so the output does not depend on how the object was built", () => {
    const parsed: unknown = JSON.parse('{"__proto__":{"x":1},"a":2}');
    const assigned: Record<string, unknown> = { a: 2 };

    expect(stableStringify(parsed)).toBe('{"a":2}');
    expect(stableStringify(parsed)).toBe(stableStringify(assigned));
  });

  it("keeps other reserved-looking keys", () => {
    expect(stableStringify({ prototype: 1, constructor: 2 })).toBe('{"constructor":2,"prototype":1}');
  });
});
