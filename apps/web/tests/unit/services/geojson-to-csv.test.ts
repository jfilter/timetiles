/**
 * Unit tests for GeoJSON-to-CSV converter.
 *
 * Tests GeoJSON FeatureCollection conversion, centroid extraction,
 * content sniffing, and WFS URL normalization.
 *
 * @module
 * @category Unit Tests
 */
import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import {
  convertGeoJsonToCsv,
  extractCentroid,
  isGeoJson,
  isGeoJsonBuffer,
  normalizeWfsUrl,
} from "@/lib/ingest/geojson-to-csv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toBuffer = (data: unknown): Buffer => Buffer.from(JSON.stringify(data), "utf-8");

/** Parse CSV output from the converter into typed rows. */
const parseCsv = (csv: Buffer): { headers: string[]; rows: Record<string, string>[] } => {
  const result = Papa.parse<Record<string, string>>(csv.toString("utf-8"), { header: true, skipEmptyLines: true });
  return { headers: result.meta.fields ?? [], rows: result.data };
};

const makeFeatureCollection = (features: unknown[]) => ({ type: "FeatureCollection", features });

const makePointFeature = (
  lng: number,
  lat: number,
  properties: Record<string, unknown> = {},
  id?: string | number
) => ({
  type: "Feature",
  ...(id != null ? { id } : {}),
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties,
});

// ---------------------------------------------------------------------------
// extractCentroid
// ---------------------------------------------------------------------------

describe("extractCentroid", () => {
  it("extracts Point centroid (lng,lat → lat,lng)", () => {
    const result = extractCentroid({ type: "Point", coordinates: [13.4, 52.5] });
    expect(result).toEqual({ latitude: 52.5, longitude: 13.4 });
  });

  it("returns null for null geometry", () => {
    expect(extractCentroid(null)).toBeNull();
  });

  it("returns null for missing type", () => {
    expect(extractCentroid({ type: "", coordinates: [] })).toBeNull();
  });

  it("computes MultiPoint centroid as average", () => {
    const result = extractCentroid({
      type: "MultiPoint",
      coordinates: [
        [10, 50],
        [14, 54],
      ],
    });
    expect(result).toEqual({ latitude: 52, longitude: 12 });
  });

  it("computes LineString centroid as bbox center", () => {
    const result = extractCentroid({
      type: "LineString",
      coordinates: [
        [10, 50],
        [14, 54],
      ],
    });
    expect(result).toEqual({ latitude: 52, longitude: 12 });
  });

  it("computes Polygon centroid from outer ring bbox", () => {
    const result = extractCentroid({
      type: "Polygon",
      coordinates: [
        [
          [10, 50],
          [14, 50],
          [14, 54],
          [10, 54],
          [10, 50],
        ],
      ],
    });
    expect(result).toEqual({ latitude: 52, longitude: 12 });
  });

  it("computes MultiPolygon centroid", () => {
    const result = extractCentroid({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [10, 50],
            [14, 50],
            [14, 54],
            [10, 54],
            [10, 50],
          ],
        ],
      ],
    });
    expect(result).toEqual({ latitude: 52, longitude: 12 });
  });

  it("computes MultiLineString centroid", () => {
    const result = extractCentroid({
      type: "MultiLineString",
      coordinates: [
        [
          [10, 50],
          [12, 52],
        ],
        [
          [12, 52],
          [14, 54],
        ],
      ],
    });
    expect(result).toEqual({ latitude: 52, longitude: 12 });
  });

  it("handles GeometryCollection using first geometry", () => {
    const result = extractCentroid({
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [13.4, 52.5] }],
    });
    expect(result).toEqual({ latitude: 52.5, longitude: 13.4 });
  });

  it("returns null for empty GeometryCollection", () => {
    const result = extractCentroid({ type: "GeometryCollection", geometries: [] });
    expect(result).toBeNull();
  });

  it("returns null for unknown geometry type", () => {
    const result = extractCentroid({ type: "Unknown", coordinates: [1, 2] });
    expect(result).toBeNull();
  });

  it("returns null for invalid Point coordinates", () => {
    const result = extractCentroid({ type: "Point", coordinates: [] });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isGeoJson / isGeoJsonBuffer
// ---------------------------------------------------------------------------

describe("isGeoJson", () => {
  it("returns true for FeatureCollection", () => {
    expect(isGeoJson({ type: "FeatureCollection", features: [] })).toBe(true);
  });

  it("returns true for single Feature", () => {
    expect(isGeoJson({ type: "Feature", geometry: null, properties: {} })).toBe(true);
  });

  it("returns false for JSON API response", () => {
    expect(isGeoJson({ data: [{ id: 1, name: "test" }] })).toBe(false);
  });

  it("returns false for array", () => {
    expect(isGeoJson([{ id: 1 }])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isGeoJson(null)).toBe(false);
  });

  it("returns false for string", () => {
    expect(isGeoJson("hello")).toBe(false);
  });
});

describe("isGeoJsonBuffer", () => {
  it("detects GeoJSON buffer", () => {
    expect(isGeoJsonBuffer(toBuffer({ type: "FeatureCollection", features: [] }))).toBe(true);
  });

  it("rejects invalid JSON", () => {
    expect(isGeoJsonBuffer(Buffer.from("not json"))).toBe(false);
  });

  it("rejects regular JSON", () => {
    expect(isGeoJsonBuffer(toBuffer({ data: [] }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// convertGeoJsonToCsv
// ---------------------------------------------------------------------------

describe("convertGeoJsonToCsv", () => {
  it("converts FeatureCollection with Point geometries", () => {
    const geojson = makeFeatureCollection([
      makePointFeature(13.4, 52.5, { name: "Berlin", population: 3500000 }),
      makePointFeature(9.99, 53.55, { name: "Hamburg", population: 1800000 }),
    ]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));

    expect(result.featureCount).toBe(2);
    expect(result.geometryTypes).toEqual(["Point"]);

    const { headers, rows } = parseCsv(result.csv);
    expect(headers).toContain("name");
    expect(headers).toContain("population");
    expect(headers).toContain("latitude");
    expect(headers).toContain("longitude");

    // First row should have Berlin's coordinates
    expect(parseFloat(rows[0]!.latitude!)).toBe(52.5);
    expect(parseFloat(rows[0]!.longitude!)).toBe(13.4);
  });

  it("wraps single Feature into FeatureCollection", () => {
    const feature = makePointFeature(13.4, 52.5, { name: "Berlin" });
    const result = convertGeoJsonToCsv(toBuffer(feature));
    expect(result.featureCount).toBe(1);
  });

  it("handles null geometry (no coordinates injected)", () => {
    const geojson = makeFeatureCollection([{ type: "Feature", geometry: null, properties: { name: "Unknown" } }]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    const { headers } = parseCsv(result.csv);

    expect(headers).toContain("name");
    // latitude/longitude should not appear since no feature has geometry
    expect(headers).not.toContain("latitude");
    expect(headers).not.toContain("longitude");
  });

  it("handles mixed geometry types", () => {
    const geojson = makeFeatureCollection([
      makePointFeature(13.4, 52.5, { name: "Point" }),
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [10, 50],
              [14, 50],
              [14, 54],
              [10, 54],
              [10, 50],
            ],
          ],
        },
        properties: { name: "Polygon" },
      },
    ]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    expect(result.featureCount).toBe(2);
    expect(result.geometryTypes).toContain("Point");
    expect(result.geometryTypes).toContain("Polygon");
  });

  it("preserves feature.id as _feature_id", () => {
    const geojson = makeFeatureCollection([makePointFeature(13.4, 52.5, { name: "Berlin" }, "feat-1")]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    const { headers, rows } = parseCsv(result.csv);
    expect(headers).toContain("_feature_id");
    expect(rows[0]!._feature_id).toBe("feat-1");
  });

  it("preserves numeric feature.id", () => {
    const geojson = makeFeatureCollection([makePointFeature(13.4, 52.5, { name: "Berlin" }, 42)]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    const { rows } = parseCsv(result.csv);
    expect(rows[0]!._feature_id).toBe("42");
  });

  it("flattens nested properties", () => {
    const geojson = makeFeatureCollection([
      makePointFeature(13.4, 52.5, { name: "Berlin", address: { street: "Unter den Linden", city: "Berlin" } }),
    ]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    const { headers } = parseCsv(result.csv);
    expect(headers).toContain("address.street");
    expect(headers).toContain("address.city");
  });

  it("handles null properties", () => {
    const geojson = makeFeatureCollection([
      { type: "Feature", geometry: { type: "Point", coordinates: [13.4, 52.5] }, properties: null },
    ]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    expect(result.featureCount).toBe(1);
    const { headers } = parseCsv(result.csv);
    expect(headers).toContain("latitude");
    expect(headers).toContain("longitude");
  });

  it("geometry coordinates override property latitude/longitude", () => {
    const geojson = makeFeatureCollection([
      makePointFeature(13.4, 52.5, { name: "Berlin", latitude: 0, longitude: 0 }),
    ]);

    const result = convertGeoJsonToCsv(toBuffer(geojson));
    const { rows } = parseCsv(result.csv);

    // Geometry values (52.5, 13.4) should override property values (0, 0)
    expect(parseFloat(rows[0]!.latitude!)).toBe(52.5);
    expect(parseFloat(rows[0]!.longitude!)).toBe(13.4);
  });

  it("throws for empty FeatureCollection", () => {
    const geojson = makeFeatureCollection([]);
    expect(() => convertGeoJsonToCsv(toBuffer(geojson))).toThrow("no features");
  });

  it("throws for invalid GeoJSON", () => {
    expect(() => convertGeoJsonToCsv(toBuffer({ type: "Unknown" }))).toThrow("Not a valid GeoJSON");
  });

  it("throws for invalid JSON", () => {
    expect(() => convertGeoJsonToCsv(Buffer.from("not json"))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// normalizeWfsUrl
// ---------------------------------------------------------------------------

describe("normalizeWfsUrl", () => {
  it("adds all WFS parameters to bare WFS path", () => {
    const url = "https://gdi.berlin.de/services/wfs/behindertenparkplaetze";
    const result = normalizeWfsUrl(url);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("service")).toBe("WFS");
    expect(parsed.searchParams.get("version")).toBe("2.0.0");
    expect(parsed.searchParams.get("request")).toBe("GetFeature");
    expect(parsed.searchParams.get("outputFormat")).toBe("application/json");
  });

  it("adds missing outputFormat to WFS URL with service param", () => {
    const url = "https://example.com/wfs?service=WFS&request=GetFeature";
    const result = normalizeWfsUrl(url);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("outputFormat")).toBe("application/json");
    expect(parsed.searchParams.get("service")).toBe("WFS");
    expect(parsed.searchParams.get("request")).toBe("GetFeature");
  });

  it("preserves existing parameters", () => {
    const url =
      "https://gdi.berlin.de/services/wfs/kuehle_raeume?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json";
    const result = normalizeWfsUrl(url);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("outputFormat")).toBe("application/json");
    expect(parsed.searchParams.get("version")).toBe("2.0.0");
  });

  it("does not modify non-WFS URLs", () => {
    const url = "https://example.com/api/data.json";
    expect(normalizeWfsUrl(url)).toBe(url);
  });

  it("returns invalid URLs unchanged", () => {
    expect(normalizeWfsUrl("not a url")).toBe("not a url");
  });

  it("handles URL ending in /wfs", () => {
    const url = "https://example.com/geoserver/wfs";
    const result = normalizeWfsUrl(url);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("service")).toBe("WFS");
    expect(parsed.searchParams.get("outputFormat")).toBe("application/json");
  });

  it("detects WFS from service param even without /wfs/ in path", () => {
    const url = "https://example.com/ows?service=WFS";
    const result = normalizeWfsUrl(url);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("request")).toBe("GetFeature");
    expect(parsed.searchParams.get("outputFormat")).toBe("application/json");
  });
});
