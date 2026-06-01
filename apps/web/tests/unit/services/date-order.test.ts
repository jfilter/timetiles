/**
 * Unit tests for per-column date day/month order detection (ADR 0040, Phase 2).
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { checkDateOrder } from "@/lib/services/schema-detection/utilities/date-order";

describe("checkDateOrder", () => {
  it("detects D/M when a sample's first part exceeds 12 (e.g. 13/02)", () => {
    // The exact bug scenario: a DD/MM column where one row disambiguates the
    // whole column, so 01/02 is NOT re-guessed as MM/DD per row.
    const result = checkDateOrder(["13/02/2024", "01/02/2024", "05/06/2024"]);
    expect(result?.order).toBe("D/M");
  });

  it("detects M/D when a sample's second part exceeds 12 (e.g. 02/13)", () => {
    const result = checkDateOrder(["02/13/2024", "02/01/2024", "06/05/2024"]);
    expect(result?.order).toBe("M/D");
  });

  it("returns ambiguous when every sample fits both orders", () => {
    const result = checkDateOrder(["01/02/2024", "03/04/2024", "05/06/2024"]);
    expect(result?.order).toBe("ambiguous");
    expect(result?.confidence).toBeLessThanOrEqual(0.4);
  });

  it("skips ISO YYYY-MM-DD (handled by the ISO parser, not a D/M-vs-M/D case)", () => {
    expect(checkDateOrder(["2024-02-13", "2024-01-05"])).toBeNull();
  });

  it("supports '.' and '-' separators", () => {
    expect(checkDateOrder(["13.02.2024", "01.02.2024", "09.10.2024"])?.order).toBe("D/M");
    expect(checkDateOrder(["02-13-2024", "02-01-2024", "06-30-2024"])?.order).toBe("M/D");
  });

  it("returns null when there is too little date-shaped evidence", () => {
    expect(checkDateOrder([])).toBeNull();
    expect(checkDateOrder(["not a date", "x", "y"])).toBeNull();
    // Below the confidence floor: only 1 of 5 looks like a date.
    expect(checkDateOrder(["13/02/2024", "a", "b", "c", "d"])).toBeNull();
  });

  it("returns null for fewer than the minimum samples when ambiguous", () => {
    // Two all-≤12 samples: fits both, but not enough evidence to call ambiguous.
    expect(checkDateOrder(["01/02/2024", "03/04/2024"])).toBeNull();
  });

  it("ignores values whose components are out of the 1-31 day range", () => {
    // 40 is not a plausible day/month → not counted as a date.
    expect(checkDateOrder(["40/02/2024", "99/99/2024"])).toBeNull();
  });
});
