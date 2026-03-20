/**
 * Integration tests for the SchemaDetectionPlugin registration, default
 * detector seeding, service.detect() with realistic data, detection during
 * an actual import pipeline, and the datasets collection extension.
 *
 * Verifies that the plugin is properly installed in the Payload CMS instance
 * and that the detection service works end-to-end.
 *
 * @module
 * @category Integration Tests
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SchemaDetectionService } from "@/lib/services/schema-detection/service";
import type { DetectionContext, FieldStatistics } from "@/lib/services/schema-detection/types";
import { logger } from "@/lib/logger";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportJobStage,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Schema Detection Plugin Integration", () => {
  // Do NOT include "schema-detectors" — those records are seeded once by the plugin's
  // onInit and should persist across tests. Truncating them would break subsequent tests
  // because onInit only runs once during Payload initialization.
  const collectionsToReset = IMPORT_PIPELINE_COLLECTIONS_TO_RESET;

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  // ---------------------------------------------------------------------------
  // 1. Plugin registration
  // ---------------------------------------------------------------------------
  describe("plugin registration", () => {
    it("should have the schema-detectors collection registered in Payload", async () => {
      // Verify the collection exists by performing a find operation
      const result = await payload.find({ collection: "schema-detectors", limit: 0 });
      expect(result).toBeDefined();
      expect(result.totalDocs).toBeTypeOf("number");
    });

    it("should expose schemaDetection on payload.config.custom", () => {
      const schemaDetection = payload.config?.custom?.schemaDetection;
      expect(schemaDetection).toBeDefined();
      expect(schemaDetection.service).toBeDefined();
      expect(schemaDetection.service).toBeInstanceOf(SchemaDetectionService);
    });

    it("should have the default detector registered in the service", () => {
      const schemaDetection = payload.config?.custom?.schemaDetection;
      const service = schemaDetection?.service as SchemaDetectionService;

      const defaultDetector = service.getDetector("default");
      expect(defaultDetector).toBeDefined();
      expect(defaultDetector?.name).toBe("default");
      expect(defaultDetector?.label).toBe("Default Schema Detector");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Default detector seeded in database
  // ---------------------------------------------------------------------------
  describe("default detector seeding", () => {
    it("should have a default detector record in the database", async () => {
      // The plugin seeds default detectors on init — re-seed by ensuring the
      // detector exists (the plugin's onInit is idempotent).
      const detectors = await payload.find({ collection: "schema-detectors", where: { name: { equals: "default" } } });

      expect(detectors.docs).toHaveLength(1);

      const detector = detectors.docs[0];
      expect(detector.name).toBe("default");
      expect(detector.enabled).toBe(true);
      expect(detector.priority).toBe(1000);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Service.detect() works with real data
  // ---------------------------------------------------------------------------
  describe("service.detect() with realistic data", () => {
    it("should detect language and field mappings from field statistics", async () => {
      const service = payload.config.custom.schemaDetection.service as SchemaDetectionService;

      // Build realistic field statistics for a German CSV
      const now = new Date();
      const fieldStats: Record<string, FieldStatistics> = {
        titel: {
          path: "titel",
          occurrences: 100,
          occurrencePercent: 100,
          nullCount: 0,
          uniqueValues: 95,
          uniqueSamples: ["Berliner Musikfestival", "Münchner Oktoberfest", "Hamburger Hafengeburtstag"],
          typeDistribution: { string: 100 },
          formats: {},
          isEnumCandidate: false,
          firstSeen: now,
          lastSeen: now,
          depth: 0,
        },
        beschreibung: {
          path: "beschreibung",
          occurrences: 100,
          occurrencePercent: 100,
          nullCount: 0,
          uniqueValues: 100,
          uniqueSamples: [
            "Ein großartiges Festival mit internationalen Künstlern in Berlin",
            "Traditionelles Volksfest mit Bier und bayerischer Kultur",
          ],
          typeDistribution: { string: 100 },
          formats: {},
          isEnumCandidate: false,
          firstSeen: now,
          lastSeen: now,
          depth: 0,
        },
        datum: {
          path: "datum",
          occurrences: 100,
          occurrencePercent: 100,
          nullCount: 0,
          uniqueValues: 90,
          uniqueSamples: ["2024-06-15T19:00:00Z", "2024-09-21T10:00:00Z", "2024-05-10T12:00:00Z"],
          typeDistribution: { string: 100 },
          formats: { dateTime: 100 },
          isEnumCandidate: false,
          firstSeen: now,
          lastSeen: now,
          depth: 0,
        },
        latitude: {
          path: "latitude",
          occurrences: 100,
          occurrencePercent: 100,
          nullCount: 0,
          uniqueValues: 80,
          uniqueSamples: [52.52, 48.1351, 53.5511],
          typeDistribution: { number: 100 },
          formats: { numeric: 100 },
          numericStats: { min: 47.0, max: 55.0, avg: 51.0, isInteger: false },
          isEnumCandidate: false,
          geoHints: { isLatitude: true, isLongitude: false, fieldNamePattern: "latitude", valueRange: true },
          firstSeen: now,
          lastSeen: now,
          depth: 0,
        },
        longitude: {
          path: "longitude",
          occurrences: 100,
          occurrencePercent: 100,
          nullCount: 0,
          uniqueValues: 80,
          uniqueSamples: [13.405, 11.582, 9.9937],
          typeDistribution: { number: 100 },
          formats: { numeric: 100 },
          numericStats: { min: 6.0, max: 15.0, avg: 11.0, isInteger: false },
          isEnumCandidate: false,
          geoHints: { isLatitude: false, isLongitude: true, fieldNamePattern: "longitude", valueRange: true },
          firstSeen: now,
          lastSeen: now,
          depth: 0,
        },
      };

      const context: DetectionContext = {
        fieldStats,
        sampleData: [
          {
            titel: "Berliner Musikfestival",
            beschreibung: "Ein großartiges Festival",
            datum: "2024-06-15T19:00:00Z",
            latitude: 52.52,
            longitude: 13.405,
          },
        ],
        headers: ["titel", "beschreibung", "datum", "latitude", "longitude"],
        config: { enabled: true, priority: 1 },
      };

      const result = await service.detect(null, context);

      // Language
      expect(result.language).toBeDefined();
      expect(result.language.code).toBeTypeOf("string");
      expect(result.language.code).toHaveLength(3); // ISO 639-3

      // Field mappings
      expect(result.fieldMappings).toBeDefined();
      expect(result.fieldMappings.title).not.toBeNull();
      expect(result.fieldMappings.title?.path).toBe("titel");
      expect(result.fieldMappings.timestamp).not.toBeNull();
      expect(result.fieldMappings.timestamp?.path).toBe("datum");

      // Patterns
      expect(result.patterns).toBeDefined();
      expect(Array.isArray(result.patterns.idFields)).toBe(true);
      expect(Array.isArray(result.patterns.enumFields)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Detection during actual import pipeline
  // ---------------------------------------------------------------------------
  describe("detection during import pipeline", () => {
    it("should populate detectedFieldMappings when running the import pipeline", async () => {
      // Set up users, catalog, and dataset
      const { users } = await withUsers(testEnv, { importer: { role: "user" } });

      const { catalog } = await withCatalog(testEnv, {
        name: "Schema Detection Plugin Test Catalog",
        user: users.importer,
      });

      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      await withDataset(testEnv, catalog.id, {
        name: "events-german.csv",
        language: "deu",
        schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
      });

      const { importFile } = await withImportFile(testEnv, catalog.id, fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        user: users.importer.id,
        datasetsCount: 0,
        datasetsProcessed: 0,
      });

      // Run jobs until schema detection completes (validate-schema follows detect-schema)
      const stageResult = await runJobsUntilImportJobStage(
        payload,
        importFile.id,
        (importJob) =>
          importJob.stage === "validate-schema" ||
          importJob.stage === "create-schema-version" ||
          importJob.stage === "completed",
        {
          maxIterations: 30,
          onPending: ({ iteration, importJob }) => {
            if (iteration % 5 === 0) {
              logger.debug("Waiting for schema detection to complete", {
                iteration,
                stage: importJob?.stage ?? "missing",
              });
            }
          },
        }
      );

      expect(stageResult.matched).toBe(true);

      // Load the import job with detectedFieldMappings
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
        depth: 0,
      });

      expect(importJobs.docs.length).toBeGreaterThan(0);
      const importJob = importJobs.docs[0];

      // Verify detectedFieldMappings are populated
      expect(importJob.detectedFieldMappings).toBeDefined();
      expect(importJob.detectedFieldMappings.titlePath).toBe("titel");
      expect(importJob.detectedFieldMappings.timestampPath).toBe("datum");
      expect(importJob.detectedFieldMappings.descriptionPath).toBe("beschreibung");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Datasets collection extended with schemaDetector field
  // ---------------------------------------------------------------------------
  describe("datasets collection extension", () => {
    it("should allow writing a schemaDetector relationship on a dataset", async () => {
      const { users } = await withUsers(testEnv, { owner: { role: "user" } });

      const { catalog } = await withCatalog(testEnv, { name: "Schema Detector Field Test Catalog", user: users.owner });

      // Find the default detector record to use as the relationship value
      const detectors = await payload.find({ collection: "schema-detectors", where: { name: { equals: "default" } } });
      expect(detectors.docs.length).toBeGreaterThan(0);
      const defaultDetectorId = detectors.docs[0].id;

      // Create a dataset with the schemaDetector field set
      const { dataset } = await withDataset(testEnv, catalog.id, { name: "Dataset With Detector" });

      // Update the dataset to link a schema detector
      const updated = await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { schemaDetector: defaultDetectorId },
      });

      expect(updated.schemaDetector).toBeDefined();

      // Read it back to confirm persistence
      const retrieved = await payload.findByID({ collection: "datasets", id: dataset.id });
      // The value may be populated (object) or a raw ID depending on depth
      const detectorValue =
        typeof retrieved.schemaDetector === "object" ? retrieved.schemaDetector?.id : retrieved.schemaDetector;
      expect(detectorValue).toBe(defaultDetectorId);
    });
  });
});
