/**
 * Unit tests for projectNumberFormats (plan → per-field NumberFormat projection).
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { projectNumberFormats } from "@/lib/filters/resolve-number-formats";

const planWithColumns = (columns: unknown[]) => ({ ops: [], columns, roles: {}, ambiguityResolution: "strict" });

describe("projectNumberFormats", () => {
  it("projects an EU number column to its NumberFormat", () => {
    const plan = planWithColumns([
      { field: "price", kind: "number", policy: { kind: "number", decimalSeparator: ",", thousandsSeparator: "." } },
    ]);
    expect(projectNumberFormats(plan, ["price"])).toEqual({
      price: { decimalSeparator: ",", thousandsSeparator: "." },
    });
  });

  it("defaults missing separators to US (decimal '.', no thousands)", () => {
    const plan = planWithColumns([{ field: "count", kind: "number", policy: { kind: "number" } }]);
    expect(projectNumberFormats(plan, ["count"])).toEqual({
      count: { decimalSeparator: ".", thousandsSeparator: null },
    });
  });

  it("omits fields whose column is not a number kind", () => {
    const plan = planWithColumns([{ field: "name", kind: "string" }]);
    expect(projectNumberFormats(plan, ["name"])).toEqual({});
  });

  it("omits fields whose number column has no number policy", () => {
    const plan = planWithColumns([{ field: "price", kind: "number" }]);
    expect(projectNumberFormats(plan, ["price"])).toEqual({});
  });

  it("omits fields not present in the plan", () => {
    const plan = planWithColumns([{ field: "price", kind: "number", policy: { kind: "number" } }]);
    expect(projectNumberFormats(plan, ["missing"])).toEqual({});
  });

  it("returns an empty object for a null/undefined/malformed plan", () => {
    expect(projectNumberFormats(undefined, ["price"])).toEqual({});
    expect(projectNumberFormats(null, ["price"])).toEqual({});
    expect(projectNumberFormats({ columns: "not-an-array" }, ["price"])).toEqual({});
  });
});
