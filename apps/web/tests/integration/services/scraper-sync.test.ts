// @vitest-environment node
/**
 * Integration tests for scraper manifest parsing.
 *
 * Tests the parseManifest function from the manifest parser service,
 * validating YAML parsing, Zod validation, default merging, security
 * checks, and error handling.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { parseManifest } from "@/lib/services/manifest-parser";

describe.sequential("Scraper Manifest Parsing", () => {
  it("should parse valid YAML manifest and return scrapers", () => {
    const yaml = `
scrapers:
  - name: Event Scraper
    slug: event-scraper
    runtime: python
    entrypoint: scraper.py
    output: events.csv
    schedule: "0 6 * * *"
    limits:
      timeout: 600
      memory: 1024
  - name: Data Fetcher
    slug: data-fetcher
    runtime: node
    entrypoint: fetch.js
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.scrapers).toHaveLength(2);

    expect(result.scrapers[0]).toEqual({
      name: "Event Scraper",
      slug: "event-scraper",
      runtime: "python",
      entrypoint: "scraper.py",
      output: "events.csv",
      schedule: "0 6 * * *",
      limits: { timeout: 600, memory: 1024 },
    });

    expect(result.scrapers[1]).toEqual({
      name: "Data Fetcher",
      slug: "data-fetcher",
      runtime: "node",
      entrypoint: "fetch.js",
      output: "data.csv",
      schedule: null,
      limits: { timeout: 300, memory: 512 },
    });
  });

  it("should fail on invalid YAML syntax", () => {
    const invalidYaml = `
scrapers:
  - name: Bad YAML
    slug: [invalid: yaml: structure
`;

    const result = parseManifest(invalidYaml);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("YAML parse error");
  });

  it("should validate slug format and reject invalid slugs", () => {
    const yaml = `
scrapers:
  - name: Bad Slug Scraper
    slug: INVALID_SLUG!!
    entrypoint: scraper.py
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("Manifest validation failed");
    expect(result.error).toContain("slug");
  });

  it("should reject entrypoints with path traversal", () => {
    const yaml = `
scrapers:
  - name: Malicious Scraper
    slug: bad-scraper
    entrypoint: ../../../etc/passwd
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("Manifest validation failed");
    expect(result.error).toContain("path traversal");
  });

  it("should apply defaults from the defaults block correctly", () => {
    const yaml = `
defaults:
  runtime: node
  limits:
    timeout: 120
    memory: 256
scrapers:
  - name: Default Scraper
    slug: default-scraper
    entrypoint: index.js
  - name: Custom Scraper
    slug: custom-scraper
    runtime: python
    entrypoint: custom.py
    limits:
      timeout: 900
      memory: 2048
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.scrapers).toHaveLength(2);

    const first = result.scrapers[0]!;
    const second = result.scrapers[1]!;

    // First scraper should inherit defaults
    expect(first.runtime).toBe("node");
    expect(first.limits.timeout).toBe(120);
    expect(first.limits.memory).toBe(256);
    expect(first.output).toBe("data.csv");
    expect(first.schedule).toBeNull();

    // Second scraper should override defaults with its own values
    expect(second.runtime).toBe("python");
    expect(second.limits.timeout).toBe(900);
    expect(second.limits.memory).toBe(2048);
  });

  it("should reject duplicate slugs", () => {
    const yaml = `
scrapers:
  - name: First Scraper
    slug: my-scraper
    entrypoint: first.py
  - name: Second Scraper
    slug: my-scraper
    entrypoint: second.py
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("Duplicate scraper slug: my-scraper");
  });

  it("should reject manifest with empty scrapers array", () => {
    const yaml = `
scrapers: []
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("Manifest validation failed");
    expect(result.error).toContain("at least one scraper");
  });

  it("should reject absolute entrypoint paths", () => {
    const yaml = `
scrapers:
  - name: Absolute Path Scraper
    slug: abs-path
    entrypoint: /usr/bin/python
`;

    const result = parseManifest(yaml);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("Manifest validation failed");
    expect(result.error).toContain("absolute path");
  });
});
