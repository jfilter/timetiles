/**
 * Unit tests for the schema-detection timestamp validator's date-type branch.
 *
 * Targets the module-private `checkDateTypeDistribution` THROUGH the only public
 * surface (`validateFieldType(stats, "timestamp"|"endTimestamp")`) so the test
 * does not widen the validators' API. The branch credits the schema builder's
 * own `date` typing — `getValueType` classifies non-ISO separated dates like
 * `DD/MM/YYYY` as type `date` while setting neither `formats.date` (ISO-only) nor
 * counting them as `string`. Without that credit such a column scores 0 across
 * every other timestamp check and is never detected as a timestamp, so the
 * ambiguous-date-order review gate (lib/jobs/workflows/review-checks.ts) can
 * never fire — the job falls into the no-timestamp gate instead. These cases
 * isolate that branch by feeding stats that score 0 on every other check
 * (no `formats`, no `uniqueSamples`, no `numericStats`, no `string` typing).
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { validateFieldType } from "@/lib/services/schema-detection/utilities/validators";
import type { FieldStatistics } from "@/lib/types/schema-detection";

/**
 * Build a FieldStatistics whose only timestamp signal is `typeDistribution.date`
 * — the non-ISO `DD/MM/YYYY` case `checkDateTypeDistribution` exists for.
 */
const dateTypedStats = (dateCount: number, occurrences: number): FieldStatistics => ({
  path: "when",
  occurrences,
  occurrencePercent: 1,
  nullCount: 0,
  uniqueValues: occurrences,
  uniqueSamples: [], // no parseable string samples -> checkParseableStrings = 0
  typeDistribution: { date: dateCount }, // no `string` typing, no `object`, no `number`
  formats: {}, // no formats.date / formats.dateTime -> checkDateFormat = 0
  isEnumCandidate: false,
  firstSeen: new Date(),
  lastSeen: new Date(),
  depth: 0,
  // no numericStats -> checkUnixTimestamp = 0
});

describe("validateFieldType timestamp — date-type distribution branch", () => {
  it("scores 1 (max) when every value is date-typed (datePct = 1.0)", () => {
    // Math.min(1, 0.7 + 1.0 * 0.3) = 1
    expect(validateFieldType(dateTypedStats(100, 100), "timestamp")).toBe(1);
  });

  it("applies the same branch to endTimestamp", () => {
    expect(validateFieldType(dateTypedStats(100, 100), "endTimestamp")).toBe(1);
  });

  it("scores >= 0.7 at the 0.5 datePct floor", () => {
    // datePct = 0.5 -> Math.min(1, 0.7 + 0.5 * 0.3) = 0.85
    const score = validateFieldType(dateTypedStats(50, 100), "timestamp");
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeCloseTo(0.85, 5);
  });

  it("returns 0 overall when datePct < 0.5 and there is no other timestamp signal", () => {
    // datePct = 0.4 -> below the 0.5 threshold; no other check contributes.
    expect(validateFieldType(dateTypedStats(40, 100), "timestamp")).toBe(0);
  });

  it("returns 0 when no values are date-typed (dateCount <= 0)", () => {
    expect(validateFieldType(dateTypedStats(0, 100), "timestamp")).toBe(0);
  });
});
