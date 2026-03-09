/**
 * Unit tests for scheduled import validation helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { validateCronExpression } from "@/lib/collections/scheduled-imports/validation";

describe("scheduled-imports validation", () => {
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
