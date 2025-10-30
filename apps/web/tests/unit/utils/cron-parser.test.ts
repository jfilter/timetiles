/**
 * Unit tests for cron expression parser and utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  describeCronExpression,
  detectCronPattern,
  parseCronExpression,
  validateCronParts,
} from "../../../lib/utils/cron-parser";

describe("Cron Parser Utilities", () => {
  describe("parseCronExpression", () => {
    it("should parse valid 5-part cron expression", () => {
      const result = parseCronExpression("0 12 * * 1");
      expect(result).toEqual({
        minute: "0",
        hour: "12",
        dayOfMonth: "*",
        month: "*",
        dayOfWeek: "1",
      });
    });

    it("should handle wildcards", () => {
      const result = parseCronExpression("* * * * *");
      expect(result).toEqual({
        minute: "*",
        hour: "*",
        dayOfMonth: "*",
        month: "*",
        dayOfWeek: "*",
      });
    });

    it("should handle extra whitespace", () => {
      const result = parseCronExpression("  0   12   *   *   1  ");
      expect(result).toEqual({
        minute: "0",
        hour: "12",
        dayOfMonth: "*",
        month: "*",
        dayOfWeek: "1",
      });
    });

    it("should handle multiple spaces between parts", () => {
      const result = parseCronExpression("0    12    *    *    1");
      expect(result).toEqual({
        minute: "0",
        hour: "12",
        dayOfMonth: "*",
        month: "*",
        dayOfWeek: "1",
      });
    });

    it("should throw error for less than 5 parts", () => {
      expect(() => parseCronExpression("0 12 *")).toThrow("Invalid cron expression: 0 12 *. Expected 5 parts, got 3");
    });

    it("should throw error for more than 5 parts", () => {
      expect(() => parseCronExpression("0 12 * * 1 extra")).toThrow(
        "Invalid cron expression: 0 12 * * 1 extra. Expected 5 parts, got 6"
      );
    });

    it("should throw error for empty expression", () => {
      expect(() => parseCronExpression("")).toThrow("Invalid cron expression: . Expected 5 parts, got 1");
    });

    it("should handle numeric values", () => {
      const result = parseCronExpression("15 8 25 12 5");
      expect(result).toEqual({
        minute: "15",
        hour: "8",
        dayOfMonth: "25",
        month: "12",
        dayOfWeek: "5",
      });
    });
  });

  describe("validateCronParts", () => {
    it("should validate wildcard for all fields", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).not.toThrow();
    });

    it("should validate minute range (0-59)", () => {
      const parts = { minute: "0", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).not.toThrow();

      parts.minute = "59";
      expect(() => validateCronParts(parts)).not.toThrow();
    });

    it("should throw error for minute < 0", () => {
      const parts = { minute: "-1", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid minute in cron expression: -1");
    });

    it("should throw error for minute > 59", () => {
      const parts = { minute: "60", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid minute in cron expression: 60");
    });

    it("should validate hour range (0-23)", () => {
      const parts = { minute: "*", hour: "0", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).not.toThrow();

      parts.hour = "23";
      expect(() => validateCronParts(parts)).not.toThrow();
    });

    it("should throw error for hour < 0", () => {
      const parts = { minute: "*", hour: "-1", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid hour in cron expression: -1");
    });

    it("should throw error for hour > 23", () => {
      const parts = { minute: "*", hour: "24", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid hour in cron expression: 24");
    });

    it("should validate day of month range (1-31)", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "1", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).not.toThrow();

      parts.dayOfMonth = "31";
      expect(() => validateCronParts(parts)).not.toThrow();
    });

    it("should throw error for day of month < 1", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "0", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid day of month in cron expression: 0");
    });

    it("should throw error for day of month > 31", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "32", month: "*", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid day of month in cron expression: 32");
    });

    it("should validate month range (1-12)", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "1", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).not.toThrow();

      parts.month = "12";
      expect(() => validateCronParts(parts)).not.toThrow();
    });

    it("should throw error for month < 1", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "0", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid month in cron expression: 0");
    });

    it("should throw error for month > 12", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "13", dayOfWeek: "*" };
      expect(() => validateCronParts(parts)).toThrow("Invalid month in cron expression: 13");
    });

    it("should validate day of week range (0-7)", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "0" };
      expect(() => validateCronParts(parts)).not.toThrow();

      parts.dayOfWeek = "7";
      expect(() => validateCronParts(parts)).not.toThrow();
    });

    it("should throw error for day of week < 0", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "-1" };
      expect(() => validateCronParts(parts)).toThrow("Invalid day of week in cron expression: -1");
    });

    it("should throw error for day of week > 7", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "8" };
      expect(() => validateCronParts(parts)).toThrow("Invalid day of week in cron expression: 8");
    });
  });

  describe("detectCronPattern", () => {
    it("should detect every-minute pattern", () => {
      const parts = { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(detectCronPattern(parts)).toBe("every-minute");
    });

    it("should detect hourly pattern", () => {
      const parts = { minute: "15", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(detectCronPattern(parts)).toBe("hourly");
    });

    it("should detect daily pattern", () => {
      const parts = { minute: "30", hour: "8", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
      expect(detectCronPattern(parts)).toBe("daily");
    });

    it("should detect weekly pattern", () => {
      const parts = { minute: "0", hour: "12", dayOfMonth: "*", month: "*", dayOfWeek: "1" };
      expect(detectCronPattern(parts)).toBe("weekly");
    });

    it("should detect monthly pattern", () => {
      const parts = { minute: "0", hour: "9", dayOfMonth: "1", month: "*", dayOfWeek: "*" };
      expect(detectCronPattern(parts)).toBe("monthly");
    });

    it("should detect complex pattern for unmatched patterns", () => {
      const parts = { minute: "15", hour: "8", dayOfMonth: "15", month: "6", dayOfWeek: "*" };
      expect(detectCronPattern(parts)).toBe("complex");
    });

    it("should detect complex pattern when both dayOfMonth and dayOfWeek are specified", () => {
      const parts = { minute: "0", hour: "12", dayOfMonth: "15", month: "*", dayOfWeek: "1" };
      expect(detectCronPattern(parts)).toBe("complex");
    });
  });

  describe("describeCronExpression", () => {
    it("should describe every-minute pattern", () => {
      expect(describeCronExpression("* * * * *")).toBe("Every minute");
    });

    it("should describe hourly pattern", () => {
      expect(describeCronExpression("15 * * * *")).toBe("Every hour at :15");
      expect(describeCronExpression("0 * * * *")).toBe("Every hour at :00");
    });

    it("should describe daily pattern", () => {
      expect(describeCronExpression("30 8 * * *")).toBe("Daily at 08:30");
      expect(describeCronExpression("0 12 * * *")).toBe("Daily at 12:00");
    });

    it("should describe weekly pattern with all days", () => {
      expect(describeCronExpression("0 12 * * 0")).toBe("Every Sunday at 12:00");
      expect(describeCronExpression("0 12 * * 1")).toBe("Every Monday at 12:00");
      expect(describeCronExpression("0 12 * * 2")).toBe("Every Tuesday at 12:00");
      expect(describeCronExpression("0 12 * * 3")).toBe("Every Wednesday at 12:00");
      expect(describeCronExpression("0 12 * * 4")).toBe("Every Thursday at 12:00");
      expect(describeCronExpression("0 12 * * 5")).toBe("Every Friday at 12:00");
      expect(describeCronExpression("0 12 * * 6")).toBe("Every Saturday at 12:00");
    });

    it("should handle day of week wrapping (7 = Sunday)", () => {
      expect(describeCronExpression("0 12 * * 7")).toBe("Every Sunday at 12:00");
    });

    it("should describe monthly pattern with ordinal suffixes", () => {
      expect(describeCronExpression("0 9 1 * *")).toBe("Monthly on the 1st at 09:00");
      expect(describeCronExpression("0 9 2 * *")).toBe("Monthly on the 2nd at 09:00");
      expect(describeCronExpression("0 9 3 * *")).toBe("Monthly on the 3rd at 09:00");
      expect(describeCronExpression("0 9 4 * *")).toBe("Monthly on the 4th at 09:00");
      expect(describeCronExpression("0 9 11 * *")).toBe("Monthly on the 11th at 09:00");
      expect(describeCronExpression("0 9 21 * *")).toBe("Monthly on the 21st at 09:00");
      expect(describeCronExpression("0 9 22 * *")).toBe("Monthly on the 22nd at 09:00");
      expect(describeCronExpression("0 9 23 * *")).toBe("Monthly on the 23rd at 09:00");
    });

    it("should return original expression for complex patterns", () => {
      const complex = "15 8 15 6 *";
      expect(describeCronExpression(complex)).toBe(complex);
    });

    it("should return original expression for invalid expressions", () => {
      const invalid = "invalid cron";
      expect(describeCronExpression(invalid)).toBe(invalid);
    });

    it("should handle errors gracefully", () => {
      expect(describeCronExpression("")).toBe("");
      expect(describeCronExpression("1 2")).toBe("1 2");
    });

    it("should format time with leading zeros", () => {
      expect(describeCronExpression("5 7 * * *")).toBe("Daily at 07:05");
      expect(describeCronExpression("0 0 * * *")).toBe("Daily at 00:00");
    });
  });
});
