/**
 * Unit tests for the data package manifest loader.
 *
 * Tests YAML loading, Zod validation, environment variable resolution,
 * metadata promotion to catalog block, and error handling.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAllManifests, loadManifest } from "@/lib/data-packages/manifest-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid manifest YAML that passes Zod validation. */
const minimalManifest = (overrides: Record<string, unknown> = {}): string => {
  const base: Record<string, unknown> = {
    slug: "test-package",
    title: "Test Package",
    summary: "A test data package",
    category: "testing",
    source: { url: "https://example.com/data.json", format: "json" },
    catalog: { name: "Test Catalog" },
    dataset: { name: "Test Dataset" },
    fieldMappings: { titlePath: "title", timestampPath: "date" },
    schedule: { type: "frequency", frequency: "daily" },
    ...overrides,
  };

  // Convert to YAML-like format using JSON (yaml parser accepts JSON)
  return JSON.stringify(base);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("manifest-loader", () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;
  let readdirSyncSpy: ReturnType<typeof vi.spyOn>;
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncSpy = vi.spyOn(fs, "existsSync");
    readdirSyncSpy = vi.spyOn(fs, "readdirSync");
    readFileSyncSpy = vi.spyOn(fs, "readFileSync");
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // loadAllManifests — directory handling
  // -------------------------------------------------------------------------

  describe("loadAllManifests", () => {
    describe("directory handling", () => {
      it("returns empty array when data packages directory does not exist", () => {
        existsSyncSpy.mockReturnValue(false);

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("returns empty array when directory exists but contains no YAML files", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["readme.txt", "config.json"] as any);

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("loads .yml files from the directory", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["package.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.slug).toBe("test-package");
      });

      it("loads .yaml files from the directory", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["package.yaml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.slug).toBe("test-package");
      });

      it("skips non-YAML files in the directory", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["package.yml", "notes.txt", "config.json"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
      });

      it("loads multiple YAML files", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["a.yml", "b.yml"] as any);

        let callCount = 0;
        readFileSyncSpy.mockImplementation(() => {
          callCount++;
          return minimalManifest({ slug: `package-${callCount}` });
        });

        const result = loadAllManifests();

        expect(result).toHaveLength(2);
        expect(result[0]!.slug).toBe("package-1");
        expect(result[1]!.slug).toBe("package-2");
      });
    });

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    describe("validation", () => {
      it("rejects manifest with missing required slug", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          JSON.stringify({
            title: "No Slug",
            summary: "Missing slug field",
            category: "test",
            source: { url: "https://example.com/data.json", format: "json" },
            catalog: { name: "Test" },
            dataset: { name: "Test" },
            fieldMappings: {},
            schedule: { type: "frequency", frequency: "daily" },
          })
        );

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("rejects manifest with invalid slug format (uppercase)", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ slug: "Invalid-Slug" }));

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("rejects manifest with missing source url", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          JSON.stringify({
            slug: "test",
            title: "Test",
            summary: "Test",
            category: "test",
            source: { format: "json" },
            catalog: { name: "Test" },
            dataset: { name: "Test" },
            fieldMappings: {},
            schedule: { type: "frequency", frequency: "daily" },
          })
        );

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("rejects manifest with invalid source format", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ source: { url: "https://example.com/data.xml", format: "xml" } })
        );

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("accepts all valid source formats (json, csv, html-in-json)", () => {
        existsSyncSpy.mockReturnValue(true);
        const formats = ["json", "csv", "html-in-json"];

        for (const format of formats) {
          readdirSyncSpy.mockReturnValue([`${format}.yml`] as any);
          readFileSyncSpy.mockReturnValue(
            minimalManifest({ slug: `test-${format}`, source: { url: "https://example.com/data", format } })
          );

          const result = loadAllManifests();

          expect(result).toHaveLength(1);
          expect(result[0]!.source.format).toBe(format);
        }
      });

      it("accepts manifest with valid schedule types", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["cron.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ schedule: { type: "cron", cronExpression: "0 */6 * * *" } }));

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.schedule.type).toBe("cron");
      });

      it("applies schedule defaults (schemaMode, timezone)", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result[0]!.schedule.schemaMode).toBe("additive");
        expect(result[0]!.schedule.timezone).toBe("UTC");
      });

      it("applies dataset language default", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result[0]!.dataset.language).toBe("eng");
      });

      it("applies tags default to empty array", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result[0]!.tags).toEqual([]);
      });

      it("validates publisher country code format (lowercase 2-letter)", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ publisher: { name: "Test Publisher", country: "INVALID" } }));

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("accepts valid publisher with all fields", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pub.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            publisher: {
              name: "Test Org",
              url: "https://example.com",
              acronym: "TO",
              description: "A test organization",
              country: "de",
              official: true,
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.publisher).toEqual({
          name: "Test Org",
          url: "https://example.com",
          acronym: "TO",
          description: "A test organization",
          country: "de",
          official: true,
        });
      });

      it("validates coverage country codes", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ coverage: { countries: ["INVALID"] } }));

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("validates geocodingBias country codes", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ geocodingBias: { countryCodes: ["ABC"] } }));

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("accepts valid geocodingBias with viewBox", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["geo.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            geocodingBias: {
              countryCodes: ["de"],
              viewBox: { minLon: 5.87, minLat: 47.27, maxLon: 15.04, maxLat: 55.06 },
              bounded: true,
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.geocodingBias).toEqual({
          countryCodes: ["de"],
          viewBox: { minLon: 5.87, minLat: 47.27, maxLon: 15.04, maxLat: 55.06 },
          bounded: true,
        });
      });

      it("validates parameter name format (lowercase alphanumeric)", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ parameters: [{ name: "Invalid-Name", label: "Test" }] }));

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("accepts valid parameters", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["params.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            parameters: [
              { name: "api_key", label: "API Key", required: true, example: "abc123" },
              { name: "region", label: "Region" },
            ],
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.parameters).toHaveLength(2);
        expect(result[0]!.parameters![0]!.name).toBe("api_key");
        expect(result[0]!.parameters![0]!.required).toBe(true);
      });

      it("accepts valid transforms", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["transforms.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            transforms: [
              { type: "rename", from: "old_field", to: "new_field" },
              { type: "date-parse", from: "date_str", inputFormat: "DD/MM/YYYY" },
              { type: "string-op", from: "name", operation: "trim" },
              { type: "parse-json-array", from: "tags" },
            ],
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.transforms).toHaveLength(4);
      });

      it("rejects transforms with invalid type", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["bad.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ transforms: [{ type: "invalid-transform", from: "field" }] })
        );

        const result = loadAllManifests();

        expect(result).toEqual([]);
      });

      it("accepts valid reviewChecks", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["review.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            reviewChecks: { skipTimestampCheck: true, skipLocationCheck: false, skipGeocodingCheck: true },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.reviewChecks).toEqual({
          skipTimestampCheck: true,
          skipLocationCheck: false,
          skipGeocodingCheck: true,
        });
      });

      it("accepts valid idStrategy on dataset", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["id.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            dataset: {
              name: "Test",
              idStrategy: { type: "external", externalIdPath: "id", duplicateStrategy: "update" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.dataset.idStrategy).toEqual({
          type: "external",
          externalIdPath: "id",
          duplicateStrategy: "update",
        });
      });

      it("accepts valid auth config on source", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              auth: { type: "bearer", bearerToken: "my-token" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.source.auth).toEqual(expect.objectContaining({ type: "bearer", bearerToken: "my-token" }));
      });

      it("accepts valid htmlExtract config", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["html.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "html-in-json",
              htmlExtract: {
                htmlPath: "html",
                recordSelector: "article.card",
                fields: [
                  { name: "title", selector: "h2" },
                  { name: "link", selector: "a", attribute: "href" },
                ],
              },
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.source.htmlExtract).toBeDefined();
        expect(result[0]!.source.htmlExtract!.fields).toHaveLength(2);
      });

      it("accepts valid setup block", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["setup.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            setup: {
              instructions: "1. Create API key at https://example.com",
              url: "https://example.com/api-keys",
              envVars: ["EXAMPLE_API_KEY"],
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.setup).toEqual({
          instructions: "1. Create API key at https://example.com",
          url: "https://example.com/api-keys",
          envVars: ["EXAMPLE_API_KEY"],
        });
      });

      it("accepts valid preProcessing config", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["preprocess.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/data.json",
              format: "json",
              preProcessing: {
                groupBy: "uid",
                mergeFields: { startDate: "min", endDate: "max" },
                extractFields: [{ from: "locations.0.coords.lat", to: "latitude" }],
              },
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.source.preProcessing).toEqual({
          groupBy: "uid",
          mergeFields: { startDate: "min", endDate: "max" },
          extractFields: [{ from: "locations.0.coords.lat", to: "latitude" }],
        });
      });

      it("accepts valid pagination config", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["paginated.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              jsonApi: {
                recordsPath: "data.results",
                pagination: {
                  enabled: true,
                  type: "offset",
                  pageParam: "offset",
                  limitParam: "limit",
                  limitValue: 100,
                  maxPages: 50,
                },
              },
            },
          })
        );

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.source.jsonApi!.pagination!.enabled).toBe(true);
        expect(result[0]!.source.jsonApi!.pagination!.type).toBe("offset");
      });
    });

    // -----------------------------------------------------------------------
    // Metadata promotion
    // -----------------------------------------------------------------------

    describe("metadata promotion to catalog", () => {
      it("promotes top-level license to catalog when catalog has none", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ license: "CC-BY-4.0" }));

        const result = loadAllManifests();

        expect(result[0]!.catalog.license).toBe("CC-BY-4.0");
      });

      it("does not overwrite catalog license when already set", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ license: "CC-BY-4.0", catalog: { name: "Test Catalog", license: "MIT" } })
        );

        const result = loadAllManifests();

        expect(result[0]!.catalog.license).toBe("MIT");
      });

      it("promotes top-level region to catalog when catalog has none", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ region: "Europe" }));

        const result = loadAllManifests();

        expect(result[0]!.catalog.region).toBe("Europe");
      });

      it("does not overwrite catalog region when already set", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ region: "Europe", catalog: { name: "Test Catalog", region: "Asia" } })
        );

        const result = loadAllManifests();

        expect(result[0]!.catalog.region).toBe("Asia");
      });

      it("promotes top-level tags to catalog when catalog has none", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ tags: ["conflict", "osint"] }));

        const result = loadAllManifests();

        expect(result[0]!.catalog.tags).toEqual(["conflict", "osint"]);
      });

      it("does not overwrite catalog tags when already set", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ tags: ["top-level-tag"], catalog: { name: "Test Catalog", tags: ["catalog-tag"] } })
        );

        const result = loadAllManifests();

        expect(result[0]!.catalog.tags).toEqual(["catalog-tag"]);
      });

      it("promotes top-level category to catalog when catalog has none", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest({ category: "conflict" }));

        const result = loadAllManifests();

        expect(result[0]!.catalog.category).toBe("conflict");
      });

      it("does not overwrite catalog category when already set", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["pkg.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ category: "conflict", catalog: { name: "Test Catalog", category: "education" } })
        );

        const result = loadAllManifests();

        expect(result[0]!.catalog.category).toBe("education");
      });
    });

    // -----------------------------------------------------------------------
    // Environment variable resolution
    // -----------------------------------------------------------------------

    describe("environment variable resolution", () => {
      it("resolves $ENV:VAR_NAME in auth bearerToken", () => {
        vi.stubEnv("MY_API_TOKEN", "secret-token-123");

        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              auth: { type: "bearer", bearerToken: "$ENV:MY_API_TOKEN" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result[0]!.source.auth!.bearerToken).toBe("secret-token-123");
      });

      it("resolves $ENV:VAR_NAME in auth apiKey", () => {
        vi.stubEnv("MY_API_KEY", "key-abc");

        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              auth: { type: "api-key", apiKey: "$ENV:MY_API_KEY", apiKeyHeader: "X-API-Key" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result[0]!.source.auth!.apiKey).toBe("key-abc");
      });

      it("resolves $ENV:VAR_NAME in auth username and password", () => {
        vi.stubEnv("AUTH_USER", "admin");
        vi.stubEnv("AUTH_PASS", "hunter2");

        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              auth: { type: "basic", username: "$ENV:AUTH_USER", password: "$ENV:AUTH_PASS" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result[0]!.source.auth!.username).toBe("admin");
        expect(result[0]!.source.auth!.password).toBe("hunter2");
      });

      it("returns undefined for unresolvable env var references", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              auth: { type: "bearer", bearerToken: "$ENV:NONEXISTENT_VAR" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result[0]!.source.auth!.bearerToken).toBeUndefined();
      });

      it("does not resolve values that are not $ENV: prefixed", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({
            source: {
              url: "https://example.com/api",
              format: "json",
              auth: { type: "bearer", bearerToken: "plain-token-value" },
            },
          })
        );

        const result = loadAllManifests();

        expect(result[0]!.source.auth!.bearerToken).toBe("plain-token-value");
      });

      it("preserves auth config when no env refs are present", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["auth.yml"] as any);
        readFileSyncSpy.mockReturnValue(
          minimalManifest({ source: { url: "https://example.com/api", format: "json", auth: { type: "none" } } })
        );

        const result = loadAllManifests();

        expect(result[0]!.source.auth!.type).toBe("none");
      });

      it("passes through undefined auth when source has no auth", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["noauth.yml"] as any);
        readFileSyncSpy.mockReturnValue(minimalManifest());

        const result = loadAllManifests();

        expect(result[0]!.source.auth).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    describe("error handling", () => {
      it("skips invalid manifests but continues loading others", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["valid.yml", "invalid.yml"] as any);

        let callCount = 0;
        readFileSyncSpy.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return minimalManifest({ slug: "valid-package" });
          return "not: valid: yaml: [";
        });

        const result = loadAllManifests();

        expect(result).toHaveLength(1);
        expect(result[0]!.slug).toBe("valid-package");
      });

      it("handles empty YAML file gracefully", () => {
        existsSyncSpy.mockReturnValue(true);
        readdirSyncSpy.mockReturnValue(["empty.yml"] as any);
        readFileSyncSpy.mockReturnValue("");

        const result = loadAllManifests();

        // Empty YAML parses to null, which will fail Zod validation
        expect(result).toEqual([]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // loadManifest — single manifest by slug
  // -------------------------------------------------------------------------

  describe("loadManifest", () => {
    it("returns manifest matching the given slug", () => {
      existsSyncSpy.mockReturnValue(true);
      readdirSyncSpy.mockReturnValue(["a.yml", "b.yml"] as any);

      let callCount = 0;
      readFileSyncSpy.mockImplementation(() => {
        callCount++;
        return minimalManifest({ slug: callCount === 1 ? "first-package" : "second-package" });
      });

      const result = loadManifest("second-package");

      expect(result).toBeDefined();
      expect(result!.slug).toBe("second-package");
    });

    it("returns undefined when no manifest matches the slug", () => {
      existsSyncSpy.mockReturnValue(true);
      readdirSyncSpy.mockReturnValue(["a.yml"] as any);
      readFileSyncSpy.mockReturnValue(minimalManifest({ slug: "existing-package" }));

      const result = loadManifest("nonexistent-package");

      expect(result).toBeUndefined();
    });

    it("returns undefined when directory does not exist", () => {
      existsSyncSpy.mockReturnValue(false);

      const result = loadManifest("any-slug");

      expect(result).toBeUndefined();
    });
  });
});
