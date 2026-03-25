/**
 * Unit tests for scheduled ingest validation helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  validateCronExpression,
  validateScheduleConfig,
  validateUrl,
} from "@/lib/collections/scheduled-ingests/validation";

describe("scheduled-ingests validation", () => {
  describe("validateCronExpression", () => {
    it("accepts zero-based cron ranges when they are otherwise valid", () => {
      expect(validateCronExpression("0-5 0 * * *")).toBe(true);
    });

    it("rejects partially numeric single cron values", () => {
      expect(validateCronExpression("5abc 0 * * *")).toMatch(/invalid minute value/i);
    });

    it("rejects partially numeric range cron values", () => {
      expect(validateCronExpression("0 1-5xyz * * *")).toMatch(/Invalid hour range/i);
    });

    it("rejects partially numeric step cron values", () => {
      expect(validateCronExpression("*/2oops 0 * * *")).toMatch(/Invalid minute step value/i);
    });

    it("rejects partially numeric list cron values", () => {
      expect(validateCronExpression("0 1,2oops * * *")).toMatch(/Invalid hour value 2oops/i);
    });
  });

  describe("validateUrl", () => {
    it("returns error when value is null", () => {
      const result = validateUrl(null);
      expect(result).toMatch(/URL is required/);
    });

    it("returns error when value is empty string", () => {
      const result = validateUrl("");
      expect(result).toMatch(/URL is required/);
    });

    it("returns true for a valid external HTTPS URL", () => {
      expect(validateUrl("https://example.com/data.csv")).toBe(true);
    });

    it("returns error for an invalid URL", () => {
      const result = validateUrl("not-a-url");
      expect(typeof result).toBe("string");
      expect(result).not.toBe(true);
      expect(result).toMatch(/Source URL/);
    });
  });

  describe("validateScheduleConfig", () => {
    it("returns true when schedule is disabled", () => {
      expect(validateScheduleConfig(null, { siblingData: { enabled: false } })).toBe(true);
    });

    it("returns error when enabled with frequency type but no frequency", () => {
      const result = validateScheduleConfig(null, { siblingData: { enabled: true, scheduleType: "frequency" } });
      expect(result).toMatch(/Frequency is required/);
    });

    it("returns error when enabled with cron type but no cron expression", () => {
      const result = validateScheduleConfig(null, { siblingData: { enabled: true, scheduleType: "cron" } });
      expect(result).toMatch(/Cron expression is required/);
    });

    it("returns true when enabled with frequency type and frequency set", () => {
      expect(
        validateScheduleConfig(null, { siblingData: { enabled: true, scheduleType: "frequency", frequency: "daily" } })
      ).toBe(true);
    });

    it("returns true when siblingData is undefined", () => {
      expect(validateScheduleConfig(null, {})).toBe(true);
    });
  });
});
