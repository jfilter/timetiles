/**
 * Unit tests for aggregation filter utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { normalizeEndDate } from "@/lib/services/aggregation-filters";

describe("aggregation-filters", () => {
  describe("normalizeEndDate", () => {
    it("should return null for null input", () => {
      expect(normalizeEndDate(null)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(normalizeEndDate("")).toBeNull();
    });

    it("should append end-of-day time to date-only string", () => {
      expect(normalizeEndDate("2024-12-31")).toBe("2024-12-31T23:59:59.999Z");
    });

    it("should pass through dates that already include time", () => {
      expect(normalizeEndDate("2024-12-31T12:00:00Z")).toBe("2024-12-31T12:00:00Z");
    });

    it("should pass through dates with any time component", () => {
      expect(normalizeEndDate("2024-01-01T00:00:00.000Z")).toBe("2024-01-01T00:00:00.000Z");
    });
  });
});
