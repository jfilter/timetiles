/**
 * Unit tests for the safe-regex validator used by the `extract` ingest transform.
 *
 * Covers the patterns most likely to stall the shared ingest worker via
 * catastrophic backtracking (ReDoS) plus the benign cases that must continue
 * to work.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { MAX_REGEX_PATTERN_LENGTH, safeExtractMatch, validateExtractPattern } from "@/lib/ingest/safe-regex";

describe("validateExtractPattern", () => {
  describe("rejects unsafe shapes", () => {
    it.each([
      ["(a+)+", "nested + on + group"],
      ["(a+)*", "nested * on + group"],
      ["(a*)+", "nested + on * group"],
      ["(a*)*", "nested * on * group"],
      ["(a{1,3})+", "nested quantifier on counted group"],
      ["(?:a+)+", "non-capturing nested quantifier"],
      ["(a+|a*)+", "quantified alternation overlap"],
    ])("rejects %s (%s)", (pattern) => {
      const result = validateExtractPattern(pattern);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toMatch(/backtracking|quantifier/i);
      }
    });
  });

  describe("rejects invalid / oversized input", () => {
    it("rejects an empty pattern", () => {
      const result = validateExtractPattern("");
      expect(result.valid).toBe(false);
    });

    it("rejects a pattern beyond the length cap", () => {
      const tooLong = "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1);
      const result = validateExtractPattern(tooLong);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain(String(MAX_REGEX_PATTERN_LENGTH));
      }
    });

    it("rejects a syntactically invalid pattern", () => {
      const result = validateExtractPattern("(");
      expect(result.valid).toBe(false);
    });
  });

  describe("accepts benign patterns", () => {
    it.each(["(\\d+)", "id-(\\w+)$", "^https?://([^/]+)/", "([A-Z]{3})-(\\d{4})", "\\b(\\w+)@(\\w+)\\.(\\w+)\\b"])(
      "accepts %s",
      (pattern) => {
        const result = validateExtractPattern(pattern);
        expect(result.valid).toBe(true);
      }
    );

    it("accepts a pattern at the maximum length", () => {
      // No nested quantifiers; just a long literal
      const pattern = "a".repeat(MAX_REGEX_PATTERN_LENGTH);
      const result = validateExtractPattern(pattern);
      expect(result.valid).toBe(true);
    });
  });
});

describe("safeExtractMatch", () => {
  it("returns the match for a benign pattern", () => {
    const match = safeExtractMatch("id-(\\w+)$", "record id-abc123");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("abc123");
  });

  it("returns null for an unsafe pattern even when the string would match", () => {
    // The pattern below is a classic ReDoS shape and must be refused before
    // we hand it to the engine.
    const match = safeExtractMatch("(a+)+", "aaaa");
    expect(match).toBeNull();
  });

  it("returns null when the pattern does not match the string", () => {
    const match = safeExtractMatch("^foo$", "bar");
    expect(match).toBeNull();
  });

  it("returns null for patterns beyond the length cap", () => {
    const tooLong = "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1);
    const match = safeExtractMatch(tooLong, "aaaa");
    expect(match).toBeNull();
  });
});
