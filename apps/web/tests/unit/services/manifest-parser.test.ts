/**
 * Unit tests for the scraper manifest YAML parser.
 *
 * Tests cover parsing valid manifests, applying defaults, validation
 * of required fields, runtime values, slug format, and path traversal
 * prevention.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import type { ManifestParseError, ManifestParseResult } from "@/lib/ingest/manifest-parser";
import { parseManifest } from "@/lib/ingest/manifest-parser";

describe("parseManifest", () => {
  describe("Valid Manifests", () => {
    it("should parse a single scraper with all fields", () => {
      const yaml = `
scrapers:
  - name: City Events
    slug: city-events
    runtime: python
    entrypoint: scrapers/city_events.py
    output: output/city_events.csv
    schedule: "0 6 * * *"
    limits:
      timeout: 120
      memory: 512
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers).toHaveLength(1);
      expect(result.scrapers[0]).toEqual({
        name: "City Events",
        slug: "city-events",
        runtime: "python",
        entrypoint: "scrapers/city_events.py",
        output: "output/city_events.csv",
        schedule: "0 6 * * *",
        limits: { timeout: 120, memory: 512 },
      });
    });

    it("should parse multiple scrapers from one manifest", () => {
      const yaml = `
scrapers:
  - name: City Events
    slug: city-events
    runtime: python
    entrypoint: scrapers/city_events.py
    output: output/city_events.csv
  - name: County Calendar
    slug: county-calendar
    runtime: node
    entrypoint: scrapers/county_calendar.js
    output: output/county_calendar.csv
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers).toHaveLength(2);
      expect(result.scrapers[0]).toEqual(
        expect.objectContaining({ name: "City Events", slug: "city-events", runtime: "python" })
      );
      expect(result.scrapers[1]).toEqual(
        expect.objectContaining({ name: "County Calendar", slug: "county-calendar", runtime: "node" })
      );
    });
  });

  describe("Defaults", () => {
    it("should apply defaults block to scrapers missing those fields", () => {
      const yaml = `
defaults:
  runtime: python
  limits:
    timeout: 60
    memory: 256
scrapers:
  - name: City Events
    slug: city-events
    entrypoint: scrapers/city_events.py
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]).toEqual(
        expect.objectContaining({ runtime: "python", limits: { timeout: 60, memory: 256 } })
      );
    });

    it("should allow scraper-level values to override defaults", () => {
      const yaml = `
defaults:
  runtime: python
  limits:
    timeout: 60
    memory: 256
scrapers:
  - name: City Events
    slug: city-events
    runtime: node
    entrypoint: scrapers/city_events.js
    output: output/city.csv
    limits:
      timeout: 300
      memory: 1024
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]).toEqual(
        expect.objectContaining({ runtime: "node", output: "output/city.csv", limits: { timeout: 300, memory: 1024 } })
      );
    });

    it("should apply default runtime when scraper omits it", () => {
      const yaml = `
defaults:
  runtime: node
scrapers:
  - name: My Scraper
    slug: my-scraper
    entrypoint: scrapers/index.js
    output: output/data.csv
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]).toEqual(expect.objectContaining({ runtime: "node" }));
    });
  });

  describe("Optional Fields", () => {
    it("should parse successfully when schedule is omitted", () => {
      const yaml = `
scrapers:
  - name: Minimal Scraper
    slug: minimal-scraper
    runtime: python
    entrypoint: scrapers/minimal.py
    output: output/minimal.csv
`;

      const result = parseManifest(yaml) as ManifestParseResult;

      expect(result.success).toBe(true);
      expect(result.scrapers[0]).toEqual(
        expect.objectContaining({
          name: "Minimal Scraper",
          slug: "minimal-scraper",
          runtime: "python",
          entrypoint: "scrapers/minimal.py",
          output: "output/minimal.csv",
          schedule: null,
        })
      );
      // Limits always get defaults applied
      expect(result.scrapers[0]?.limits).toBeDefined();
    });
  });

  describe("Validation Errors", () => {
    it("should fail on missing name", () => {
      const yaml = `
scrapers:
  - slug: no-name
    runtime: python
    entrypoint: scrapers/no_name.py
    output: output/no_name.csv
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/name/i);
    });

    it("should fail on missing entrypoint", () => {
      const yaml = `
scrapers:
  - name: No Entrypoint
    slug: no-entrypoint
    runtime: python
    output: output/no_entrypoint.csv
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/entrypoint/i);
    });

    it("should fail on invalid runtime value", () => {
      const yaml = `
scrapers:
  - name: Bad Runtime
    slug: bad-runtime
    runtime: ruby
    entrypoint: scrapers/bad.rb
    output: output/bad.csv
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/runtime/i);
    });

    it("should fail on slug with spaces", () => {
      const yaml = `
scrapers:
  - name: Bad Slug
    slug: bad slug here
    runtime: python
    entrypoint: scrapers/bad.py
    output: output/bad.csv
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/slug/i);
    });

    it("should fail on slug with special characters", () => {
      const yaml = `
scrapers:
  - name: Bad Slug
    slug: bad@slug!
    runtime: python
    entrypoint: scrapers/bad.py
    output: output/bad.csv
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/slug/i);
    });

    it("should fail on path traversal in entrypoint", () => {
      const yaml = `
scrapers:
  - name: Path Traversal
    slug: path-traversal
    runtime: python
    entrypoint: scrapers/../../etc/passwd
    output: output/traversal.csv
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/entrypoint/i);
    });

    it("should fail on empty scrapers array", () => {
      const yaml = `
scrapers: []
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
    });

    it("should fail on malformed YAML", () => {
      const result = parseManifest("{{invalid yaml: [");

      expect(result.success).toBe(false);
    });

    it("should fail on duplicate slugs", () => {
      const yaml = `
scrapers:
  - name: Scraper A
    slug: duplicate
    runtime: python
    entrypoint: a.py
  - name: Scraper B
    slug: duplicate
    runtime: python
    entrypoint: b.py
`;

      const result = parseManifest(yaml) as ManifestParseError;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/duplicate/i);
    });
  });
});
