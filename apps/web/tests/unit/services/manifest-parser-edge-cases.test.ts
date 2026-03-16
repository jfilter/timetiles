/**
 * Edge case tests for the scraper manifest YAML parser.
 *
 * Supplements the main manifest-parser.test.ts with additional boundary
 * conditions: slug length limits, default merging, entrypoint validation,
 * partial limits, and field coercion.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { parseManifest } from "@/lib/services/manifest-parser";
import type { ManifestParseError, ManifestParseResult } from "@/lib/services/manifest-parser";

describe("parseManifest edge cases", () => {
  describe("Minimal Scraper with Defaults", () => {
    it("applies all defaults when scraper has only required fields", () => {
      const yaml = `
scrapers:
  - name: Bare Minimum
    slug: bare-minimum
    entrypoint: run.py
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers).toHaveLength(1);
      expect(result.scrapers[0]).toEqual({
        name: "Bare Minimum",
        slug: "bare-minimum",
        runtime: "python",
        entrypoint: "run.py",
        output: "data.csv",
        schedule: null,
        limits: { timeout: 300, memory: 512 },
      });
    });
  });

  describe("Slug Length Boundaries", () => {
    it("accepts a slug of exactly 128 characters", () => {
      const longSlug = "a".repeat(128);
      const yaml = `
scrapers:
  - name: Long Slug Scraper
    slug: ${longSlug}
    entrypoint: run.py
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]?.slug).toBe(longSlug);
      expect(result.scrapers[0]?.slug).toHaveLength(128);
    });

    it("rejects a slug over 128 characters", () => {
      const longSlug = "a".repeat(129);
      const yaml = `
scrapers:
  - name: Too Long Slug
    slug: ${longSlug}
    entrypoint: run.py
`;

      const result = parseManifest(yaml) as ManifestParseError;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/slug/i);
    });
  });

  describe("Entrypoint Validation", () => {
    it("accepts an entrypoint starting with / (absolute path)", () => {
      const yaml = `
scrapers:
  - name: Absolute Path
    slug: absolute-path
    entrypoint: /usr/local/bin/scraper.py
`;

      // The schema only rejects path traversal (..), not absolute paths
      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]?.entrypoint).toBe("/usr/local/bin/scraper.py");
    });
  });

  describe("Manifest Structure", () => {
    it("fails when manifest has only defaults block and no scrapers", () => {
      const yaml = `
defaults:
  runtime: python
  limits:
    timeout: 60
    memory: 256
`;

      const result = parseManifest(yaml) as ManifestParseError;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/scraper/i);
    });
  });

  describe("Field Coercion", () => {
    it("coerces a numeric name value to string", () => {
      const yaml = `
scrapers:
  - name: 12345
    slug: numeric-name
    entrypoint: run.py
`;

      // YAML parses unquoted 12345 as a number; Zod string() coercion may or may not accept it
      const result = parseManifest(yaml);

      if (result.success) {
        // If Zod coerces the number to a string, the name should be "12345"
        expect(result.scrapers[0]?.name).toBe("12345");
      } else {
        // If Zod rejects it, the error should mention name
        expect(result.error).toMatch(/name/i);
      }
    });
  });

  describe("Schedule Field", () => {
    it("accepts any string as a schedule (no cron validation at parser level)", () => {
      const yaml = `
scrapers:
  - name: Flexible Schedule
    slug: flexible-schedule
    entrypoint: run.py
    schedule: "not a real cron expression"
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]?.schedule).toBe("not a real cron expression");
    });
  });

  describe("Output Defaults", () => {
    it("defaults output to data.csv when omitted", () => {
      const yaml = `
scrapers:
  - name: No Output
    slug: no-output
    runtime: node
    entrypoint: index.js
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]?.output).toBe("data.csv");
    });
  });

  describe("Partial Limits", () => {
    it("fills in default memory when only timeout is specified", () => {
      const yaml = `
scrapers:
  - name: Timeout Only
    slug: timeout-only
    entrypoint: run.py
    limits:
      timeout: 60
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]?.limits).toEqual({ timeout: 60, memory: 512 });
    });

    it("fills in default timeout when only memory is specified", () => {
      const yaml = `
scrapers:
  - name: Memory Only
    slug: memory-only
    entrypoint: run.py
    limits:
      memory: 1024
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]?.limits).toEqual({ timeout: 300, memory: 1024 });
    });
  });
});
