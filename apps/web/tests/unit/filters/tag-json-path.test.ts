/**
 * Unit tests for the jsonpath pre-filter the PL/pgSQL event functions match tag filters with.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { buildTagJsonPath, hasArrayIndexSegment } from "@/lib/filters/tag-json-path";

describe("buildTagJsonPath", () => {
  it("matches any selected value of a top-level tag field", () => {
    expect(buildTagJsonPath({ tags: ["a", "b"] }, new Set(["tags"]))).toBe(
      '($."tags"[*] == "a" || $."tags"[*] == "b")'
    );
  });

  it("checks both the literal dotted key and the nested path", () => {
    expect(buildTagJsonPath({ "meta.labels": ["x"] }, new Set(["meta.labels"]))).toBe(
      '($."meta.labels"[*] == "x" || $."meta"."labels"[*] == "x")'
    );
  });

  it("requires every tag field", () => {
    expect(buildTagJsonPath({ a: ["1"], b: ["2"] }, new Set(["a", "b"]))).toBe(
      '($."a"[*] == "1") && ($."b"[*] == "2")'
    );
  });

  it("escapes quotes and backslashes in values and keeps non-ASCII keys", () => {
    expect(buildTagJsonPath({ Schlagwörter: ['a"b\\c'] }, new Set(["Schlagwörter"]))).toBe(
      String.raw`($."Schlagwörter"[*] == "a\"b\\c")`
    );
  });

  it("leaves out keys the field validator rejects", () => {
    expect(buildTagJsonPath({ 'say "hi"': ["a"] }, new Set(['say "hi"']))).toBeUndefined();
  });

  it("leaves out scalar fields, empty selections and keys with an array index", () => {
    const fieldFilters = { kind: ["k"], tags: [], "rows.0": ["x"], labels: ["l"] };
    expect(buildTagJsonPath(fieldFilters, new Set(["tags", "rows.0", "labels"]))).toBe('($."labels"[*] == "l")');
  });

  it("returns undefined when no tag filter can be expressed", () => {
    expect(buildTagJsonPath(undefined, new Set(["tags"]))).toBeUndefined();
    expect(buildTagJsonPath({ tags: ["a"] }, undefined)).toBeUndefined();
    expect(buildTagJsonPath({ kind: ["k"] }, new Set(["tags"]))).toBeUndefined();
    expect(buildTagJsonPath({ "rows.-1": ["x"] }, new Set(["rows.-1"]))).toBeUndefined();
  });
});

describe("hasArrayIndexSegment", () => {
  it("detects numeric segments only", () => {
    expect(hasArrayIndexSegment("rows.0")).toBe(true);
    expect(hasArrayIndexSegment("rows.-1.name")).toBe(true);
    expect(hasArrayIndexSegment("meta.labels")).toBe(false);
    expect(hasArrayIndexSegment("v2")).toBe(false);
  });
});
