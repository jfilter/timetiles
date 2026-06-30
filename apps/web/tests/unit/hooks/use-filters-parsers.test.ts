/**
 * Unit tests for the URL-param filter parsers in use-filters.
 *
 * These guard the explore page against a crash from a shared/edited URL whose
 * `ff`/`rf` value is valid JSON of the wrong shape (the client has no Zod
 * validation on nuqs params).
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { parseFieldFilters, parseRangeFilters } from "@/lib/hooks/use-filters";

describe("parseFieldFilters", () => {
  it("parses well-formed field filters", () => {
    expect(parseFieldFilters('{"genre":["rock","jazz"]}')).toEqual({ genre: ["rock", "jazz"] });
  });

  it("returns {} for null / empty / invalid JSON", () => {
    expect(parseFieldFilters(null)).toEqual({});
    expect(parseFieldFilters("")).toEqual({});
    expect(parseFieldFilters("not json")).toEqual({});
  });

  it("drops wrong-shape entries instead of throwing (URL-param crash guard)", () => {
    expect(parseFieldFilters('{"x":null}')).toEqual({});
    expect(parseFieldFilters('{"x":5}')).toEqual({});
    expect(parseFieldFilters('{"x":["a",1]}')).toEqual({}); // non-string array element
    expect(parseFieldFilters('{"good":["a"],"bad":null}')).toEqual({ good: ["a"] });
  });

  it("returns {} for a top-level array or non-object", () => {
    expect(parseFieldFilters("[1,2]")).toEqual({});
    expect(parseFieldFilters('"str"')).toEqual({});
  });
});

describe("parseRangeFilters", () => {
  it("parses well-formed range filters", () => {
    expect(parseRangeFilters('{"price":{"min":10,"max":20}}')).toEqual({ price: { min: 10, max: 20 } });
  });

  it("treats a missing bound as null", () => {
    expect(parseRangeFilters('{"price":{"min":10}}')).toEqual({ price: { min: 10, max: null } });
  });

  it("drops wrong-shape entries instead of throwing", () => {
    expect(parseRangeFilters('{"x":null}')).toEqual({});
    expect(parseRangeFilters('{"x":5}')).toEqual({});
    expect(parseRangeFilters('{"x":{"min":"10"}}')).toEqual({}); // non-numeric bound → no valid range
  });

  it("returns {} for null / invalid JSON / non-object", () => {
    expect(parseRangeFilters(null)).toEqual({});
    expect(parseRangeFilters("nope")).toEqual({});
    expect(parseRangeFilters("[1]")).toEqual({});
  });
});
