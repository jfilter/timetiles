/**
 * Unit tests for the shared unique-violation detector.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "@/lib/database/unique-violation";

describe("isUniqueViolation", () => {
  it("detects a raw pg 23505 error by code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("does not mistake a foreign-key value for a SQLSTATE code", () => {
    const error = Object.assign(new Error("Key (catalog_id)=(23505) is not present in table catalogs."), {
      code: "23503",
    });
    expect(isUniqueViolation(error)).toBe(false);
  });

  it("does not mistake a missing constraint for a uniqueness violation", () => {
    const error = Object.assign(new Error('constraint "datasets_catalog_name_unique" does not exist'), {
      code: "42704",
    });
    expect(isUniqueViolation(error, "datasets_catalog_name_unique")).toBe(false);
  });

  it("detects a Payload ValidationError wrapping the pg error", () => {
    const err = { data: { errors: [{ message: "Value must be unique", path: "dataPackageSlug" }] } };
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("detects the code inside an error message string", () => {
    expect(isUniqueViolation(new Error("insert failed: 23505 unique_violation"))).toBe(true);
  });

  it("detects a duplicate-key message", () => {
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint "x"'))).toBe(true);
  });

  it("matches a named constraint passed by the caller", () => {
    const err = new Error('violates unique constraint "datasets_catalog_name_unique"');
    expect(isUniqueViolation(err, "datasets_catalog_name_unique")).toBe(true);
  });

  it("ignores empty constraint names", () => {
    expect(isUniqueViolation(new Error("some other failure"), "")).toBe(false);
  });

  it("returns false for an unrelated error", () => {
    expect(isUniqueViolation(new Error("connection refused"))).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // foreign-key violation
  });

  it("returns false for null/undefined", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
