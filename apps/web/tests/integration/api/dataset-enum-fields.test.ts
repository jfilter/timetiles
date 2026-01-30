/**
 * Integration tests for dataset enum field detection.
 *
 * Verifies that datasets store fieldMetadata with enum candidates
 * that can be used for categorical filtering.
 *
 * @module
 * @category Integration Tests
 */
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { FieldStatistics } from "../../../lib/types/schema-detection";
import type { TestEnvironment } from "../../setup/integration/environment";

describe("Dataset enum fields", () => {
  let payload: Payload;
  let testDatasetId: number;
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Enum Fields Test Catalog",
      description: "Test catalog for enum field detection",
      isPublic: true,
    });

    // Create test dataset with fieldMetadata containing enum candidates
    const now = new Date();
    const fieldMetadata: Record<string, FieldStatistics> = {
      category: {
        path: "category",
        occurrences: 100,
        occurrencePercent: 100,
        nullCount: 0,
        uniqueValues: 3,
        uniqueSamples: ["Music", "Sports", "Art"],
        typeDistribution: { string: 100 },
        formats: {},
        isEnumCandidate: true,
        enumValues: [
          { value: "Music", count: 40, percent: 40 },
          { value: "Sports", count: 35, percent: 35 },
          { value: "Art", count: 25, percent: 25 },
        ],
        firstSeen: now,
        lastSeen: now,
        depth: 0,
      },
      status: {
        path: "status",
        occurrences: 95,
        occurrencePercent: 95,
        nullCount: 5,
        uniqueValues: 2,
        uniqueSamples: ["Active", "Pending"],
        typeDistribution: { string: 95 },
        formats: {},
        isEnumCandidate: true,
        enumValues: [
          { value: "Active", count: 70, percent: 70 },
          { value: "Pending", count: 30, percent: 30 },
        ],
        firstSeen: now,
        lastSeen: now,
        depth: 0,
      },
      description: {
        path: "description",
        occurrences: 90,
        occurrencePercent: 90,
        nullCount: 10,
        uniqueValues: 80,
        uniqueSamples: ["Some text..."],
        typeDistribution: { string: 90 },
        formats: {},
        isEnumCandidate: false, // Not an enum - too many unique values
        firstSeen: now,
        lastSeen: now,
        depth: 0,
      },
    };

    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Enum Fields Test Dataset",
      isPublic: true,
    });

    // Update dataset with fieldMetadata (not in withDataset options)
    await payload.update({
      collection: "datasets",
      id: dataset.id,
      data: { fieldMetadata },
    });

    testDatasetId = dataset.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("should store fieldMetadata with enum candidates on dataset", async () => {
    const dataset = await payload.findByID({
      collection: "datasets",
      id: testDatasetId,
    });

    expect(dataset.fieldMetadata).toBeDefined();
    expect(dataset.fieldMetadata).not.toBeNull();

    const metadata = dataset.fieldMetadata as Record<string, FieldStatistics>;
    expect(metadata.category).toBeDefined();
    expect(metadata.category?.isEnumCandidate).toBe(true);
    expect(metadata.category?.enumValues).toHaveLength(3);
  });

  it("should identify enum candidates vs non-enum fields", async () => {
    const dataset = await payload.findByID({
      collection: "datasets",
      id: testDatasetId,
    });

    const metadata = dataset.fieldMetadata as Record<string, FieldStatistics>;

    // Enum candidates
    expect(metadata.category?.isEnumCandidate).toBe(true);
    expect(metadata.status?.isEnumCandidate).toBe(true);

    // Non-enum field
    expect(metadata.description?.isEnumCandidate).toBe(false);
  });
});
