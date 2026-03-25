/**
 * Unit tests for scheduled ingest field definitions.
 *
 * Tests the timezone field validator from core-fields.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { coreFields } from "@/lib/collections/scheduled-ingests/fields/core-fields";

const timezoneField = coreFields.find((f: any) => f.name === "timezone") as any;

if (!timezoneField?.validate) {
  throw new Error("timezone field or its validate function not found in coreFields");
}

const validate = timezoneField.validate;

describe("scheduled-ingests timezone field validation", () => {
  it("returns true for null value", () => {
    expect(validate(null, {} as any)).toBe(true);
  });

  it("returns true for UTC", () => {
    expect(validate("UTC", {} as any)).toBe(true);
  });

  it("returns true for a valid IANA timezone", () => {
    expect(validate("Europe/Berlin", {} as any)).toBe(true);
  });

  it("returns error string for an invalid timezone", () => {
    const result = validate("Not/A/Timezone", {} as any);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/not a valid IANA timezone/);
  });
});
