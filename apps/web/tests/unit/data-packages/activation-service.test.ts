/**
 * Unit tests for data-package activation helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { buildActivationKey } from "@/lib/data-packages/activation-service";

describe("buildActivationKey", () => {
  it("returns the bare slug when there are no parameters", () => {
    expect(buildActivationKey("berlin-events", {})).toBe("berlin-events");
  });

  it("produces the same key regardless of parameter insertion order", () => {
    const a = buildActivationKey("pkg", { year: "2026", city: "berlin" });
    const b = buildActivationKey("pkg", { city: "berlin", year: "2026" });
    expect(a).toBe(b);
  });

  it("sorts parameters locale-independently so the uniqueness key is stable across environments", () => {
    // Regression: parameters were sorted with String.prototype.localeCompare,
    // whose ordering depends on the runtime locale/ICU. This key is persisted as
    // `dataPackageSlug` and compared to reject duplicate activations, so a
    // locale-dependent ordering could let a duplicate slip through. Ordering must
    // not depend on localeCompare.
    const params = { city: "berlin", year: "2026", _region: "eu" };
    const expected = buildActivationKey("pkg", params);

    const spy = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      that: string
    ): number {
      if (this < that) return 1;
      if (this > that) return -1;
      return 0;
    });
    try {
      expect(buildActivationKey("pkg", params)).toBe(expected);
    } finally {
      spy.mockRestore();
    }
  });
});
