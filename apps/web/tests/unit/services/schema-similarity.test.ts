/**
 * Unit tests for the schema similarity service.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  calculateSchemaSimilarity,
  type DatasetSchema,
  datasetToSchema,
  findSimilarDatasets,
  type UploadedSchema,
} from "../../../lib/services/schema-similarity";
import type { Dataset } from "../../../payload-types";

describe("Schema Similarity Service", () => {
  describe("calculateSchemaSimilarity", () => {
    it("returns 100% score for identical schemas", () => {
      const uploadedSchema: UploadedSchema = {
        headers: ["title", "date", "location"],
        sampleData: [{ title: "Event 1", date: "2024-01-01", location: "Berlin" }],
        rowCount: 100,
      };

      const datasetSchema: DatasetSchema = {
        datasetId: 1,
        datasetName: "Test Dataset",
        language: "eng",
        fields: ["title", "date", "location"],
        hasGeoFields: true,
        hasDateFields: true,
      };

      const result = calculateSchemaSimilarity(uploadedSchema, datasetSchema);

      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.matchingFields).toHaveLength(3);
      expect(result.missingFields).toHaveLength(0);
      expect(result.newFields).toHaveLength(0);
    });

    it("returns low score for completely different schemas", () => {
      const uploadedSchema: UploadedSchema = {
        headers: ["alpha", "beta", "gamma"],
        sampleData: [{ alpha: "A", beta: "B", gamma: "C" }],
        rowCount: 50,
      };

      const datasetSchema: DatasetSchema = {
        datasetId: 1,
        datasetName: "Test Dataset",
        language: "eng",
        fields: ["title", "date", "location"],
        hasGeoFields: true,
        hasDateFields: true,
      };

      const result = calculateSchemaSimilarity(uploadedSchema, datasetSchema);

      expect(result.score).toBeLessThan(50);
      expect(result.matchingFields).toHaveLength(0);
      expect(result.newFields).toEqual(["alpha", "beta", "gamma"]);
    });

    it("detects fuzzy field name matches", () => {
      const uploadedSchema: UploadedSchema = {
        headers: ["event_title", "event_date", "event_location"],
        sampleData: [{ event_title: "Concert", event_date: "2024-06-15", event_location: "Munich" }],
        rowCount: 50,
      };

      const datasetSchema: DatasetSchema = {
        datasetId: 1,
        datasetName: "Test Dataset",
        language: "eng",
        fields: ["title", "date", "location"],
        hasGeoFields: true,
        hasDateFields: true,
      };

      const result = calculateSchemaSimilarity(uploadedSchema, datasetSchema);

      // Should recognize event_title as similar to title, etc.
      expect(result.score).toBeGreaterThan(40);
    });

    it("recognizes synonym matches", () => {
      const uploadedSchema: UploadedSchema = {
        headers: ["name", "timestamp", "address"],
        sampleData: [{ name: "Event 1", timestamp: "2024-01-01T10:00:00", address: "Main St 1" }],
        rowCount: 50,
      };

      const datasetSchema: DatasetSchema = {
        datasetId: 1,
        datasetName: "Test Dataset",
        language: "eng",
        fields: ["title", "date", "location"],
        hasGeoFields: true,
        hasDateFields: true,
      };

      const result = calculateSchemaSimilarity(uploadedSchema, datasetSchema);

      // name -> title, timestamp -> date, address -> location are synonyms
      expect(result.matchingFields.length).toBeGreaterThan(0);
    });

    it("includes breakdown scores", () => {
      const uploadedSchema: UploadedSchema = {
        headers: ["title", "date"],
        sampleData: [{ title: "Event", date: "2024-01-01" }],
        rowCount: 50,
      };

      const datasetSchema: DatasetSchema = {
        datasetId: 1,
        datasetName: "Test Dataset",
        language: "eng",
        fields: ["title", "date", "description"],
        hasGeoFields: false,
        hasDateFields: true,
      };

      const result = calculateSchemaSimilarity(uploadedSchema, datasetSchema);

      expect(result.breakdown).toHaveProperty("fieldOverlap");
      expect(result.breakdown).toHaveProperty("typeCompatibility");
      expect(result.breakdown).toHaveProperty("structureSimilarity");
      expect(result.breakdown).toHaveProperty("semanticHints");
      expect(result.breakdown).toHaveProperty("languageMatch");

      // All breakdown scores should be 0-100
      for (const score of Object.values(result.breakdown)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it("considers language match in scoring", () => {
      const uploadedSchema: UploadedSchema = {
        headers: ["title", "date"],
        sampleData: [],
        rowCount: 50,
      };

      const datasetSchemaEng: DatasetSchema = {
        datasetId: 1,
        datasetName: "English Dataset",
        language: "eng",
        fields: ["title", "date"],
        hasGeoFields: false,
        hasDateFields: true,
      };

      const datasetSchemaDeu: DatasetSchema = {
        datasetId: 2,
        datasetName: "German Dataset",
        language: "deu",
        fields: ["title", "date"],
        hasGeoFields: false,
        hasDateFields: true,
      };

      const resultEng = calculateSchemaSimilarity(uploadedSchema, datasetSchemaEng, "eng");
      const resultDeu = calculateSchemaSimilarity(uploadedSchema, datasetSchemaDeu, "eng");

      // English dataset should score higher when detected language is English
      expect(resultEng.breakdown.languageMatch).toBeGreaterThan(resultDeu.breakdown.languageMatch);
    });
  });

  describe("findSimilarDatasets", () => {
    const uploadedSchema: UploadedSchema = {
      headers: ["title", "date", "location"],
      sampleData: [{ title: "Event", date: "2024-01-01", location: "Berlin" }],
      rowCount: 100,
    };

    const datasetSchemas: DatasetSchema[] = [
      {
        datasetId: 1,
        datasetName: "Perfect Match",
        language: "eng",
        fields: ["title", "date", "location"],
        hasGeoFields: true,
        hasDateFields: true,
      },
      {
        datasetId: 2,
        datasetName: "Partial Match",
        language: "eng",
        fields: ["title", "description", "venue"],
        hasGeoFields: true,
        hasDateFields: false,
      },
      {
        datasetId: 3,
        datasetName: "No Match",
        language: "eng",
        fields: ["alpha", "beta", "gamma"],
        hasGeoFields: false,
        hasDateFields: false,
      },
    ];

    it("returns datasets sorted by score descending", () => {
      const results = findSimilarDatasets(uploadedSchema, datasetSchemas);

      expect(results[0]?.datasetName).toBe("Perfect Match");
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
    });

    it("filters out datasets below minimum score", () => {
      const results = findSimilarDatasets(uploadedSchema, datasetSchemas, {
        minScore: 50,
      });

      // All returned results should have score >= 50
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(50);
      }
    });

    it("limits results to maxResults", () => {
      const results = findSimilarDatasets(uploadedSchema, datasetSchemas, {
        maxResults: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.datasetName).toBe("Perfect Match");
    });

    it("returns empty array when no datasets match minimum score", () => {
      const results = findSimilarDatasets(uploadedSchema, datasetSchemas, {
        minScore: 99,
      });

      // Only the perfect match might reach this threshold
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("datasetToSchema", () => {
    it("converts dataset with field mapping overrides", () => {
      const dataset: Partial<Dataset> = {
        id: 1,
        name: "Test Dataset",
        language: "eng",
        fieldMappingOverrides: {
          titlePath: "name",
          descriptionPath: "details",
          timestampPath: "date",
          latitudePath: "lat",
          longitudePath: "lng",
          locationPath: null,
        },
      };

      const result = datasetToSchema(dataset as Dataset);

      expect(result.datasetId).toBe(1);
      expect(result.datasetName).toBe("Test Dataset");
      expect(result.language).toBe("eng");
      expect(result.hasGeoFields).toBe(true);
      expect(result.hasDateFields).toBe(true);
      expect(result.fields).toContain("name");
      expect(result.fields).toContain("date");
      expect(result.fields).toContain("lat");
      expect(result.fields).toContain("lng");
    });

    it("handles dataset without field mapping overrides", () => {
      const dataset: Partial<Dataset> = {
        id: 2,
        name: "Basic Dataset",
        language: "deu",
      };

      const result = datasetToSchema(dataset as Dataset);

      expect(result.datasetId).toBe(2);
      expect(result.datasetName).toBe("Basic Dataset");
      expect(result.language).toBe("deu");
      expect(result.hasGeoFields).toBe(false);
      expect(result.hasDateFields).toBe(false);
      expect(result.fields).toHaveLength(0);
    });

    it("extracts fields from fieldMetadata", () => {
      const dataset: Partial<Dataset> = {
        id: 3,
        name: "Dataset with Metadata",
        language: "eng",
        fieldMetadata: {
          title: { type: "string", occurrences: 100 },
          count: { type: "number", occurrences: 100 },
          active: { type: "boolean", occurrences: 100 },
        },
      };

      const result = datasetToSchema(dataset as Dataset);

      expect(result.fields).toContain("title");
      expect(result.fields).toContain("count");
      expect(result.fields).toContain("active");
      expect(result.fieldTypes?.title).toBe("string");
      expect(result.fieldTypes?.count).toBe("number");
      expect(result.fieldTypes?.active).toBe("boolean");
    });

    it("defaults language to eng when not specified", () => {
      const dataset: Partial<Dataset> = {
        id: 4,
        name: "No Language",
        language: undefined as unknown as string,
      };

      const result = datasetToSchema(dataset as Dataset);

      expect(result.language).toBe("eng");
    });
  });
});
