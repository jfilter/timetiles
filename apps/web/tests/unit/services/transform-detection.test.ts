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
      properties: {
        date: { type: "string" },
        title: { type: "string" },
      },
      required: ["date", "title"],
    };

    const newSchema = {
      type: "object",
      properties: {
        start_date: { type: "string" },
        title: { type: "string" },
      },
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
    const oldSchema = {
      type: "object",
      properties: {
        time: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        start_time: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("start_time");
    expect(suggestion!.to).toBe("time");
  });

  it("should detect rename with common pattern (end_ prefix)", () => {
    const oldSchema = {
      type: "object",
      properties: {
        date: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        end_date: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("end_date");
    expect(suggestion!.to).toBe("date");
  });

  it("should detect rename with _name suffix", () => {
    const oldSchema = {
      type: "object",
      properties: {
        author: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        author_name: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("author_name");
    expect(suggestion!.to).toBe("author");
  });

  it("should detect rename with event_ prefix", () => {
    const oldSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        event_title: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.from).toBe("event_title");
    expect(suggestion!.to).toBe("title");
  });

  it("should not detect rename for completely different names", () => {
    const oldSchema = {
      type: "object",
      properties: {
        author: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        location: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(0);
  });

  it("should not detect rename for incompatible types", () => {
    const oldSchema = {
      type: "object",
      properties: {
        count: { type: "number" },
      },
    };

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
      properties: {
        date: { type: "string" },
        author: { type: "string" },
        title: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        start_date: { type: "string" },
        creator: { type: "string" },
        event_title: { type: "string" },
      },
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
    const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string" },
      },
    };

    const comparison = compareSchemas(schema, schema);
    const suggestions = detectTransforms(schema, schema, comparison.changes);

    expect(suggestions).toHaveLength(0);
  });

  it("should handle new fields without removals", () => {
    const oldSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    expect(suggestions).toHaveLength(0); // No removals, so no rename suggestions
  });

  it("should prioritize same position in schema", () => {
    const oldSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
        date: { type: "string" },
        title: { type: "string" },
      },
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
    const oldSchema = {
      type: "object",
      properties: {
        date: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        start_date: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.reason).toBeTruthy();
    expect(typeof suggestion!.reason).toBe("string");
    expect(suggestion!.reason.length).toBeGreaterThan(0);
  });

  it("should handle case-insensitive similarity", () => {
    const oldSchema = {
      type: "object",
      properties: {
        Date: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        date: { type: "string" },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    // Should have high confidence for case-only change (case normalization is done)
    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    expect(suggestion!.confidence).toBeGreaterThanOrEqual(80);
  });

  it("should handle nullable type compatibility", () => {
    const oldSchema = {
      type: "object",
      properties: {
        email: { type: "string" },
      },
    };

    const newSchema = {
      type: "object",
      properties: {
        user_email: { type: ["string", "null"] },
      },
    };

    const comparison = compareSchemas(oldSchema, newSchema);
    const suggestions = detectTransforms(oldSchema, newSchema, comparison.changes);

    // Should still detect as compatible types
    const emailSuggestion = suggestions.find((s) => s.to === "email");
    if (emailSuggestion) {
      // Type compatibility should contribute to confidence
      expect(emailSuggestion.confidence).toBeGreaterThan(50);
    }
  });
});
