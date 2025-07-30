import { describe, expect, it } from "vitest";

import { ProgressiveSchemaBuilder } from "../../../lib/services/schema-builder";

describe("ProgressiveSchemaBuilder", () => {
  describe("processBatch", () => {
    it("detects new fields progressively", async () => {
      const builder = new ProgressiveSchemaBuilder();
      // First batch with basic fields
      const result1 = await builder.processBatch([{ id: 1, name: "Test", status: "active" }], 1);

      expect(result1.schemaChanged).toBe(true);
      expect(result1.changes).toHaveLength(3); // 3 new fields
      expect(result1.changes).toContainEqual(
        expect.objectContaining({
          type: "new_field",
          path: "id",
          severity: "info",
          autoApprovable: true,
        }),
      );

      // Second batch with additional field
      const result2 = await builder.processBatch([{ id: 2, name: "Test2", status: "pending", category: "A" }], 2);

      expect(result2.schemaChanged).toBe(true);
      expect(result2.changes).toHaveLength(1); // 1 new field (category)
      expect(result2.changes[0]).toMatchObject({
        type: "new_field",
        path: "category",
      });
    });

    it("tracks field statistics correctly", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { id: 1, name: "Test1", value: 100 },
        { id: 2, name: "Test2", value: 200 },
        { id: 3, name: null, value: 150 },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["id"]?.occurrences).toBe(3);
      expect(state.fieldStats["id"]?.nullCount).toBe(0);
      expect(state.fieldStats["name"]?.occurrences).toBe(3);
      expect(state.fieldStats["name"]?.nullCount).toBe(1);
      expect(state.fieldStats["value"]?.numericStats).toMatchObject({
        min: 100,
        max: 200,
        avg: 150,
        isInteger: true,
      });
    });

    it("detects type conflicts", async () => {
      const builder = new ProgressiveSchemaBuilder();
      // First batch with number value
      await builder.processBatch([{ id: "1", value: 123 }], 1);

      // Second batch with string value for same field
      const result = await builder.processBatch([{ id: "2", value: "123" }], 2);

      expect(result.changes).toContainEqual(
        expect.objectContaining({
          type: "type_change",
          path: "value",
          severity: "warning",
          autoApprovable: false,
        }),
      );

      const state = builder.getState();
      expect(state.typeConflicts).toHaveLength(1);
      expect(state.typeConflicts[0]).toMatchObject({
        path: "value",
        types: { number: 1, string: 1 },
      });
    });

    it("respects max depth configuration", async () => {
      const deepBuilder = new ProgressiveSchemaBuilder(undefined, { maxDepth: 2 });

      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: "too deep",
            },
          },
        },
      };

      await deepBuilder.processBatch([deepObject], 1);
      const state = deepBuilder.getState();

      expect(state.fieldStats["level1"]).toBeDefined();
      expect(state.fieldStats["level1.level2"]).toBeDefined();
      expect(state.fieldStats["level1.level2.level3"]).toBeUndefined(); // Beyond max depth
    });

    it("maintains rotating sample buffer", async () => {
      const smallBufferBuilder = new ProgressiveSchemaBuilder(undefined, { maxSamples: 3 });

      // Add 5 records to a buffer that holds only 3
      for (let i = 1; i <= 5; i++) {
        await smallBufferBuilder.processBatch([{ id: i, name: `Record ${i}` }], i);
      }

      const state = smallBufferBuilder.getState();
      expect(state.dataSamples).toHaveLength(3);
      expect(state.dataSamples[0]).toMatchObject({ id: 3 }); // Oldest remaining
      expect(state.dataSamples[2]).toMatchObject({ id: 5 }); // Newest
    });
  });

  describe("enum detection", () => {
    it("detects enum candidates by count", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: i,
          status: (() => {
            if (i % 3 === 0) return "active";
            if (i % 3 === 1) return "pending";
            return "completed";
          })(),
          category: `cat${i}`, // Too many unique values
        }));

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["status"]?.isEnumCandidate).toBe(true);
      expect(state.fieldStats["status"]?.enumValues).toHaveLength(3);
      expect(state.fieldStats["category"]?.isEnumCandidate).toBe(false);
    });

    it("detects enum candidates by percentage", async () => {
      const percentageBuilder = new ProgressiveSchemaBuilder(undefined, {
        enumMode: "percentage",
        enumThreshold: 10, // 10% threshold
      });

      const records = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: i,
          type: i < 95 ? "common" : "rare", // 5% are "rare"
        }));

      await percentageBuilder.processBatch(records, 1);
      const state = percentageBuilder.getState();

      expect(state.fieldStats["type"]?.isEnumCandidate).toBe(true);
      expect(state.fieldStats["type"]?.uniqueValues).toBe(2);
    });
  });

  describe("geographic field detection", () => {
    it("detects standard lat/lng fields", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { location: { lat: 40.7128, lng: -74.006 } },
        { location: { lat: 51.5074, lng: -0.1278 } },
        { location: { lat: 35.6762, lng: 139.6503 } },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.detectedGeoFields).toMatchObject({
        latitude: "location.lat",
        longitude: "location.lng",
        confidence: 1,
      });
    });

    it("detects various lat/lng field patterns", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { latitude: 40.7128, longitude: -74.006 },
        { latitude: 51.5074, longitude: -0.1278 },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.detectedGeoFields.latitude).toBe("latitude");
      expect(state.detectedGeoFields.longitude).toBe("longitude");
    });

    it("validates coordinate ranges", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { lat: 200, lng: 300 }, // Invalid ranges
        { lat: 40.7128, lng: -74.006 },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      // Should not detect invalid coordinates
      expect(state.detectedGeoFields.confidence).toBe(0);
    });
  });

  describe("format detection", () => {
    it("detects email format", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { email: "user1@example.com" },
        { email: "user2@example.com" },
        { email: "user3@example.com" },
        { email: "not-an-email" },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["email"]?.formats.email).toBe(3);
    });

    it("detects URL format", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [{ website: "https://example.com" }, { website: "https://test.org" }, { website: "not-a-url" }];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["website"]?.formats.url).toBe(2);
    });

    it("detects date-time format", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { created: "2024-01-15T10:30:00Z" },
        { created: "2024-02-20T14:45:00Z" },
        { created: "invalid-date" },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["created"]?.formats.dateTime).toBe(2);
    });

    it("detects numeric strings", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [{ code: "12345" }, { code: "67890" }, { code: "abc123" }];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["code"]?.formats.numeric).toBe(2);
    });
  });

  describe("schema generation", () => {
    it("generates schema from samples", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { id: 1, name: "Test", active: true },
        { id: 2, name: "Test2", active: false },
      ];

      await builder.processBatch(records, 1);
      const schema = await builder.generateSchema();

      expect(schema).toBeDefined();
      expect(schema.$schema).toBeDefined();
      expect(schema.definitions).toBeDefined();
      expect(schema.definitions.EventData).toBeDefined();
      expect(schema.definitions.EventData.type).toBe("object");
      expect(schema.definitions.EventData.properties).toBeDefined();

      // Verify properties are correctly inferred
      const properties = schema.definitions.EventData.properties;
      expect(properties.id).toBeDefined();
      expect(properties.name).toBeDefined();
      expect(properties.active).toBeDefined();
    });

    it("enhances schema with field statistics", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { email: "test@example.com", age: 25 },
        { email: "user@example.com", age: 30 },
      ];

      await builder.processBatch(records, 1);
      const schema = await builder.generateSchema();

      expect(schema).toBeDefined();
      // Schema should include format and constraint metadata from our enhancements
    });

    it("handles empty samples gracefully", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const schema = await builder.generateSchema();
      expect(schema).toBeNull();
    });
  });

  describe("schema comparison", () => {
    it("detects new fields as non-breaking changes", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const previousSchema = {
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      };

      await builder.processBatch([{ id: "1", name: "Test", category: "A" }], 1);

      const comparison = await builder.compareWithPrevious(previousSchema);

      expect(comparison.changes).toHaveLength(1);
      expect(comparison.changes[0]).toMatchObject({
        type: "new_field",
        path: "category",
        severity: "info",
        autoApprovable: true,
      });
      expect(comparison.isBreaking).toBe(false);
      expect(comparison.canAutoApprove).toBe(true);
    });

    it("detects removed fields as breaking changes", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const previousSchema = {
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          deprecated: { type: "string" },
        },
      };

      await builder.processBatch(
        [
          { id: "1", name: "Test" }, // Missing 'deprecated' field
        ],
        1,
      );

      const comparison = await builder.compareWithPrevious(previousSchema);

      expect(comparison.changes).toContainEqual(
        expect.objectContaining({
          type: "removed_field",
          path: "deprecated",
          severity: "warning",
          autoApprovable: false,
        }),
      );
      expect(comparison.requiresApproval).toBe(true);
    });

    it("detects type changes as breaking", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const previousSchema = {
        properties: {
          id: { type: "number" },
          name: { type: "string" },
        },
      };

      await builder.processBatch(
        [
          { id: "abc", name: "Test" }, // id is now string
        ],
        1,
      );

      const comparison = await builder.compareWithPrevious(previousSchema);

      expect(comparison.changes).toContainEqual(
        expect.objectContaining({
          type: "type_change",
          path: "id",
          details: { oldType: "number", newType: "string" },
          severity: "error",
          autoApprovable: false,
        }),
      );
      expect(comparison.isBreaking).toBe(true);
    });

    it("detects enum value additions as safe", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const previousSchema = {
        properties: {
          status: { type: "string", enum: ["active", "pending"] },
        },
      };

      await builder.processBatch(
        [
          { status: "active" },
          { status: "pending" },
          { status: "completed" }, // New enum value
        ],
        1,
      );

      const currentSchema = await builder.generateSchema();

      const comparison = await builder.compareWithPrevious(previousSchema);

      expect(comparison.changes).toContainEqual(
        expect.objectContaining({
          type: "enum_change",
          path: "status",
          details: { added: ["completed"], removed: [] },
          severity: "info",
          autoApprovable: true,
        }),
      );
    });

    it("detects enum value removals as breaking", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const previousSchema = {
        properties: {
          status: { type: "string", enum: ["active", "pending", "archived"] },
        },
      };

      await builder.processBatch(
        [
          { status: "active" },
          { status: "pending" },
          // 'archived' is no longer present
        ],
        1,
      );

      const comparison = await builder.compareWithPrevious(previousSchema);

      expect(comparison.changes).toContainEqual(
        expect.objectContaining({
          type: "enum_change",
          severity: "warning",
          autoApprovable: false,
        }),
      );
    });
  });

  describe("state persistence", () => {
    it("can be initialized with existing state", async () => {
      // First builder processes some data
      const builder1 = new ProgressiveSchemaBuilder();
      await builder1.processBatch([{ id: 1, name: "Test" }], 1);
      const state1 = builder1.getState();

      // Second builder continues from saved state
      const builder2 = new ProgressiveSchemaBuilder(state1);
      const result = await builder2.processBatch([{ id: 2, name: "Test2", newField: "value" }], 2);

      expect(result.changes).toHaveLength(1); // Only newField
      expect(result.changes[0]?.path).toBe("newField");

      const state2 = builder2.getState();
      expect(state2.recordCount).toBe(2);
      expect(state2.batchCount).toBe(2);
    });
  });

  describe("ID field detection", () => {
    it("detects common ID field patterns", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { id: "123", uuid: "550e8400-e29b-41d4-a716-446655440000", name: "Test" },
        { id: "456", uuid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8", name: "Test2" },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.detectedIdFields).toContain("id");
      expect(state.detectedIdFields).toContain("uuid");
    });
  });

  describe("edge cases", () => {
    it("handles null and undefined values", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { id: 1, value: null },
        { id: 2, value: undefined },
        { id: 3, value: "test" },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["value"]?.nullCount).toBe(2);
      expect(state.fieldStats["value"]?.occurrences).toBe(3);
    });

    it("handles arrays", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [
        { id: 1, tags: ["a", "b", "c"] },
        { id: 2, tags: ["d", "e"] },
      ];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.fieldStats["tags"]?.typeDistribution.array).toBe(2);
    });

    it("handles empty objects", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const records = [{}, { id: 1 }];

      await builder.processBatch(records, 1);
      const state = builder.getState();

      expect(state.recordCount).toBe(2);
      expect(state.fieldStats["id"]).toBeDefined();
      expect(state.fieldStats["id"]?.occurrences).toBe(1);
    });

    it("handles very long field paths", async () => {
      const builder = new ProgressiveSchemaBuilder();
      const deepObject = {
        very: {
          deeply: {
            nested: {
              structure: {
                with: {
                  value: "test",
                },
              },
            },
          },
        },
      };

      await builder.processBatch([deepObject], 1);
      const state = builder.getState();

      // Should handle within max depth
      const deepFields = Object.keys(state.fieldStats).filter((k) => k.includes("."));
      expect(deepFields.length).toBeGreaterThan(0);
    });
  });
});
