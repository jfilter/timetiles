/**
 * Unit tests for transform detection algorithm.
 *
 * Tests the ability to detect potential field renames from schema changes.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { compareSchemas, detectTransforms } from "@/lib/services/schema-builder/schema-comparison";

describe("Transform detection", () => {
  it("should detect simple rename (high similarity)", () => {
    const oldSchema = {
      type: "object",
      properties: { date: { type: "string" }, title: { type: "string" } },
      required: ["date", "title"],
    };

    const newSchema = {
      type: "object",
      properties: { start_date: { type: "string" }, title: { type: "string" } },
      required: ["start_date", "title"],
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion).toMatchObject({
      type: "rename",
      from: "start_date",
      to: "date",
      confidence: expect.any(Number),
    });
    expect(suggestion!.confidence).toBeGreaterThanOrEqual(70);
  });

  it("should detect rename with common pattern (start_ prefix)", () => {
    const oldSchema = { type: "object", properties: { time: { type: "string" } } };

    const newSchema = { type: "object", properties: { start_time: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("start_time");
    expect(suggestion!.to).toBe("time");
  });

  it("should detect rename with common pattern (end_ prefix)", () => {
    const oldSchema = { type: "object", properties: { date: { type: "string" } } };

    const newSchema = { type: "object", properties: { end_date: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("end_date");
    expect(suggestion!.to).toBe("date");
  });

  it("should detect rename with _name suffix", () => {
    const oldSchema = { type: "object", properties: { author: { type: "string" } } };

    const newSchema = { type: "object", properties: { author_name: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("author_name");
    expect(suggestion!.to).toBe("author");
  });

  it("should detect rename with event_ prefix", () => {
    const oldSchema = { type: "object", properties: { title: { type: "string" } } };

    const newSchema = { type: "object", properties: { event_title: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("event_title");
    expect(suggestion!.to).toBe("title");
  });

  it("should not detect rename for completely different names", () => {
    const oldSchema = { type: "object", properties: { author: { type: "string" } } };

    const newSchema = { type: "object", properties: { location: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(0);
  });

  it("should not detect rename for incompatible types", () => {
    const oldSchema = { type: "object", properties: { count: { type: "number" } } };

    const newSchema = {
      type: "object",
      properties: {
        count_items: { type: "object" }, // Different type
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    // Should have low confidence due to type incompatibility
    const highConfidenceSuggestions = suggestions.filter((s) => s.confidence >= 70);
    expect(highConfidenceSuggestions).toHaveLength(0);
  });

  it("should detect multiple renames", () => {
    const oldSchema = {
      type: "object",
      properties: { date: { type: "string" }, author: { type: "string" }, title: { type: "string" } },
    };

    const newSchema = {
      type: "object",
      properties: { start_date: { type: "string" }, creator: { type: "string" }, event_title: { type: "string" } },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions.length).toBeGreaterThan(0);

    // Check for date → start_date
    const dateSuggestion = suggestions.find((s) => s.to === "date");
    expect(dateSuggestion).toBeDefined();
    expect(dateSuggestion?.from).toBe("start_date");

    // Check for title → event_title
    const titleSuggestion = suggestions.find((s) => s.to === "title");
    expect(titleSuggestion).toBeDefined();
    expect(titleSuggestion?.from).toBe("event_title");
  });

  it("should handle schema with no changes", () => {
    const schema = { type: "object", properties: { title: { type: "string" }, date: { type: "string" } } };

    const comparison = compareSchemas(schema, schema);
    const suggestions = detectTransforms(schema, schema, comparison.changes);

    expect(suggestions).toHaveLength(0);
  });

  it("should handle new fields without removals", () => {
    const oldSchema = { type: "object", properties: { title: { type: "string" } } };

    const newSchema = { type: "object", properties: { title: { type: "string" }, date: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(0); // No removals, so no rename suggestions
  });

  it("should prioritize same position in schema", () => {
    const oldSchema = {
      type: "object",
      properties: { id: { type: "string" }, date: { type: "string" }, title: { type: "string" } },
    };

    const newSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
        start_date: { type: "string" }, // Same position as 'date'
        title: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    const dateSuggestion = suggestions.find((s) => s.to === "date");
    expect(dateSuggestion).toBeDefined();
    // Should have higher confidence due to position proximity
    expect(dateSuggestion!.confidence).toBeGreaterThan(70);
  });

  it("should include reason in suggestions", () => {
    const oldSchema = { type: "object", properties: { date: { type: "string" } } };

    const newSchema = { type: "object", properties: { start_date: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.reason).toBeTruthy();
    expect(typeof suggestion!.reason).toBe("string");
    expect(suggestion!.reason.length).toBeGreaterThan(0);
  });

  it("should handle case-insensitive similarity", () => {
    const oldSchema = { type: "object", properties: { Date: { type: "string" } } };

    const newSchema = { type: "object", properties: { date: { type: "string" } } };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    // Should have high confidence for case-only change (case normalization is done)
    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.confidence).toBeGreaterThanOrEqual(80);
  });

  // "string" and ["string","null"] must score as the SAME type, so making a column
  // nullable never costs a rename its suggestion. The previous version of this test
  // used a name pair that scores below the 70-point threshold either way and hid the
  // whole assertion behind `if (suggestion)`, so it proved nothing.
  it("treats a nullable type as compatible with its base type", () => {
    const oldSchema = { type: "object", properties: { Date: { type: "string" } } };
    const nullableSchema = { type: "object", properties: { date: { type: ["string", "null"] } } };
    const plainSchema = { type: "object", properties: { date: { type: "string" } } };

    const nullableSuggestions = detectTransforms(
      oldSchema,
      nullableSchema,
      compareSchemas(oldSchema, nullableSchema).changes
    );
    const plainSuggestions = detectTransforms(oldSchema, plainSchema, compareSchemas(oldSchema, plainSchema).changes);

    expect(nullableSuggestions).toHaveLength(1);
    // `from` is the new field, `to` the existing one it maps onto.
    expect(nullableSuggestions[0]!.from).toBe("date");
    expect(nullableSuggestions[0]!.to).toBe("Date");
    expect(nullableSuggestions[0]!.reason).toContain("Compatible types");
    expect(nullableSuggestions[0]!.confidence).toBe(plainSuggestions[0]!.confidence);
  });
});
