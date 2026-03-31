/**
 * Unit tests for import transform service.
 *
 * Tests the path utilities and transform application logic.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { applyTransforms, applyTransformsBatch } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import { deleteByPath, getByPath, setByPath } from "@/lib/utils/object-path";

describe("Path utilities", () => {
  describe("getByPath", () => {
    it("should get value at simple path", () => {
      const obj = { name: "John", age: 30 };
      expect(getByPath(obj, "name")).toBe("John");
      expect(getByPath(obj, "age")).toBe(30);
    });

    it("should get value at nested path", () => {
      const obj = { user: { email: "john@example.com", profile: { age: 30 } } };
      expect(getByPath(obj, "user.email")).toBe("john@example.com");
      expect(getByPath(obj, "user.profile.age")).toBe(30);
    });

    it("should return undefined for non-existent path", () => {
      const obj = { user: { email: "john@example.com" } };
      expect(getByPath(obj, "user.phone")).toBeUndefined();
      expect(getByPath(obj, "missing")).toBeUndefined();
      expect(getByPath(obj, "user.profile.age")).toBeUndefined();
    });

    it("should handle null and undefined values", () => {
      const obj = { value: null, other: undefined };
      expect(getByPath(obj, "value")).toBeNull();
      expect(getByPath(obj, "other")).toBeUndefined();
    });

    it("should handle array elements", () => {
      const obj = { coords: [10, 20, 30] };
      expect(getByPath(obj, "coords.0")).toBe(10);
      expect(getByPath(obj, "coords.1")).toBe(20);
      expect(getByPath(obj, "coords.2")).toBe(30);
    });
  });

  describe("setByPath", () => {
    it("should set value at simple path", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, "name", "John");
      expect(obj).toEqual({ name: "John" });
    });

    it("should set value at nested path", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, "user.email", "john@example.com");
      expect(obj).toEqual({ user: { email: "john@example.com" } });
    });

    it("should create nested structure", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, "user.profile.age", 30);
      expect(obj).toEqual({ user: { profile: { age: 30 } } });
    });

    it("should overwrite existing values", () => {
      const obj: Record<string, unknown> = { user: { email: "old@example.com" } };
      setByPath(obj, "user.email", "new@example.com");
      expect(obj).toEqual({ user: { email: "new@example.com" } });
    });

    it("should handle deep nesting", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, "a.b.c.d.e", "deep");
      expect(obj).toEqual({ a: { b: { c: { d: { e: "deep" } } } } });
    });
  });

  describe("deleteByPath", () => {
    it("should delete value at simple path", () => {
      const obj: Record<string, unknown> = { name: "John", age: 30 };
      deleteByPath(obj, "name");
      expect(obj).toEqual({ age: 30 });
    });

    it("should delete value at nested path", () => {
      const obj: Record<string, unknown> = { user: { email: "john@example.com", name: "John" } };
      deleteByPath(obj, "user.email");
      expect(obj).toEqual({ user: { name: "John" } });
    });

    it("should handle non-existent paths gracefully", () => {
      const obj: Record<string, unknown> = { user: { email: "john@example.com" } };
      deleteByPath(obj, "user.phone"); // Should not throw
      expect(obj).toEqual({ user: { email: "john@example.com" } });
    });

    it("should not delete parent objects", () => {
      const obj: Record<string, unknown> = { user: { email: "john@example.com", name: "John" } };
      deleteByPath(obj, "user.email");
      expect(obj.user).toBeDefined();
      expect(obj.user).toEqual({ name: "John" });
    });
  });
});

describe("applyTransforms", () => {
  it("should apply simple rename transform", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ start_date: "2024-01-15", name: "Event" });
    expect(result).not.toHaveProperty("date");
  });

  it("should apply nested path rename", () => {
    const data = { user: { email: "john@example.com", name: "John" } };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "user.email", to: "contact.email", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ user: { name: "John" }, contact: { email: "john@example.com" } });
  });

  it("should apply multiple transforms", () => {
    const data = { date: "2024-01-15", author: "John", title: "Event" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
      { id: "2", type: "rename", from: "author", to: "creator", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ start_date: "2024-01-15", creator: "John", title: "Event" });
  });

  it("should skip inactive transforms", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: false, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ date: "2024-01-15", name: "Event" });
  });

  it("should skip transforms for non-existent fields", () => {
    const data = { name: "Event" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ name: "Event" });
    expect(result).not.toHaveProperty("start_date");
  });

  it("should not mutate original data", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const original = { ...data };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    applyTransforms(data, transforms);
    expect(data).toEqual(original); // Original unchanged
  });

  it("should handle empty transforms array", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const result = applyTransforms(data, []);
    expect(result).toEqual(data);
  });

  it("should handle complex nested transformations", () => {
    const data = { event: { date: "2024-01-15", location: { city: "NYC", coords: { lat: 40.7, lng: -74 } } } };

    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "event.date", to: "start_date", active: true, autoDetected: false },
      { id: "2", type: "rename", from: "event.location.coords.lat", to: "latitude", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.start_date).toBe("2024-01-15");
    expect(result.latitude).toBe(40.7);
    expect(getByPath(result, "event.date")).toBeUndefined();
    expect(getByPath(result, "event.location.coords.lat")).toBeUndefined();
  });

  it("should apply expression string-op to convert string to number", () => {
    const data = { count: "42" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "count",
        operation: "expression",
        expression: "toNumber(value)",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.count).toBe(42);
    expect(typeof result.count).toBe("number");
  });

  it("should apply expression string-op to convert string to boolean", () => {
    const data = { active: "true" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "active",
        operation: "expression",
        expression: "parseBool(value)",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.active).toBe(true);
    expect(typeof result.active).toBe("boolean");
  });

  it("should keep original value when expression fails", () => {
    const data = { value: "not-a-number" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "value",
        operation: "expression",
        expression: "parseNumber(value)",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.value).toBe("not-a-number");
  });

  it("should leave impossible ISO dates unchanged", () => {
    const data = { date: "2024-02-30" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "YYYY-MM-DD",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.date).toBe("2024-02-30");
  });

  it("should apply uppercase string-op transform", () => {
    const data = { title: "hello world" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.title).toBe("HELLO WORLD");
  });

  it("should apply lowercase string-op transform", () => {
    const data = { title: "HELLO WORLD" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "lowercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.title).toBe("hello world");
  });

  it("should apply replace string-op transform", () => {
    const data = { title: "hello-world-2024" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "title",
        operation: "replace",
        pattern: "-",
        replacement: " ",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.title).toBe("hello world 2024");
  });

  it("should skip string-op on non-string values", () => {
    const data = { count: 42 };
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "count", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.count).toBe(42);
  });

  it("should apply concatenate transform", () => {
    const data = { first: "John", last: "Doe", age: 30 };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "last"],
        separator: " ",
        to: "fullName",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.fullName).toBe("John Doe");
    expect(result.first).toBe("John"); // originals preserved
    expect(result.last).toBe("Doe");
  });

  it("should concatenate with custom separator", () => {
    const data = { city: "Berlin", country: "Germany" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["city", "country"],
        separator: ", ",
        to: "location",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.location).toBe("Berlin, Germany");
  });

  it("should skip undefined fields in concatenate", () => {
    const data = { first: "John" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "middle", "last"],
        separator: " ",
        to: "name",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.name).toBe("John");
  });

  it("should apply split transform", () => {
    const data = { name: "John Doe" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "split",
        from: "name",
        delimiter: " ",
        toFields: ["firstName", "lastName"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.firstName).toBe("John");
    expect(result.lastName).toBe("Doe");
  });

  it("should split with custom delimiter", () => {
    const data = { coords: "40.7128,-74.0060" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "split",
        from: "coords",
        delimiter: ",",
        toFields: ["lat", "lng"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.lat).toBe("40.7128");
    expect(result.lng).toBe("-74.0060");
  });

  it("should handle split with fewer parts than toFields", () => {
    const data = { value: "single" };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "split",
        from: "value",
        delimiter: ",",
        toFields: ["a", "b", "c"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.a).toBe("single");
    expect(result.b).toBeUndefined();
    expect(result.c).toBeUndefined();
  });

  it("should skip split on non-string values", () => {
    const data = { count: 42 };
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "split",
        from: "count",
        delimiter: ",",
        toFields: ["a", "b"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.count).toBe(42);
    expect(result.a).toBeUndefined();
  });

  it("should chain multiple transform types together", () => {
    const data = { full_name: "john doe", date: "15/03/2024" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "full_name", operation: "uppercase", active: true, autoDetected: false },
      {
        id: "2",
        type: "split",
        from: "full_name",
        delimiter: " ",
        toFields: ["first", "last"],
        active: true,
        autoDetected: false,
      },
      {
        id: "3",
        type: "date-parse",
        from: "date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.first).toBe("JOHN");
    expect(result.last).toBe("DOE");
    expect(result.date).toBe("2024-03-15");
  });
});

describe("applyTransformsBatch", () => {
  it("should apply transforms to array of objects", () => {
    const data = [
      { date: "2024-01-15", name: "Event 1" },
      { date: "2024-01-16", name: "Event 2" },
      { date: "2024-01-17", name: "Event 3" },
    ];

    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    const result = applyTransformsBatch(data, transforms);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ start_date: "2024-01-15", name: "Event 1" });
    expect(result[1]).toEqual({ start_date: "2024-01-16", name: "Event 2" });
    expect(result[2]).toEqual({ start_date: "2024-01-17", name: "Event 3" });
  });

  it("should handle empty array", () => {
    const result = applyTransformsBatch([], []);
    expect(result).toEqual([]);
  });

  it("should not mutate original array", () => {
    const data = [{ date: "2024-01-15", name: "Event" }];
    const original = structuredClone(data);

    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    applyTransformsBatch(data, transforms);
    expect(data).toEqual(original);
  });
});

describe("date-parse inputFormat handling", () => {
  const makeDateTransform = (inputFormat: string): IngestTransform[] => [
    {
      id: "1",
      type: "date-parse",
      from: "date",
      inputFormat,
      outputFormat: "YYYY-MM-DD",
      active: true,
      autoDetected: false,
    },
  ];

  it("should parse DD/MM/YYYY format correctly", () => {
    expect(applyTransforms({ date: "15/03/2024" }, makeDateTransform("DD/MM/YYYY")).date).toBe("2024-03-15");
  });
  it("should parse MM/DD/YYYY format correctly", () => {
    expect(applyTransforms({ date: "03/15/2024" }, makeDateTransform("MM/DD/YYYY")).date).toBe("2024-03-15");
  });
  it("should disambiguate 01/02/2024 as MM/DD/YYYY", () => {
    expect(applyTransforms({ date: "01/02/2024" }, makeDateTransform("MM/DD/YYYY")).date).toBe("2024-01-02");
  });
  it("should disambiguate 01/02/2024 as DD/MM/YYYY", () => {
    expect(applyTransforms({ date: "01/02/2024" }, makeDateTransform("DD/MM/YYYY")).date).toBe("2024-02-01");
  });
  it("should still parse ISO format YYYY-MM-DD (backward compatibility)", () => {
    expect(applyTransforms({ date: "2024-03-15" }, makeDateTransform("YYYY-MM-DD")).date).toBe("2024-03-15");
  });
  it("should parse DD.MM.YYYY (European dot separator)", () => {
    expect(applyTransforms({ date: "15.03.2024" }, makeDateTransform("DD.MM.YYYY")).date).toBe("2024-03-15");
  });
  it("should parse DD-MM-YYYY format", () => {
    expect(applyTransforms({ date: "15-03-2024" }, makeDateTransform("DD-MM-YYYY")).date).toBe("2024-03-15");
  });
  it("should parse MM-DD-YYYY format", () => {
    expect(applyTransforms({ date: "03-15-2024" }, makeDateTransform("MM-DD-YYYY")).date).toBe("2024-03-15");
  });
  it("should parse YYYY/MM/DD format", () => {
    expect(applyTransforms({ date: "2024/03/15" }, makeDateTransform("YYYY/MM/DD")).date).toBe("2024-03-15");
  });
  it("should fall back to new Date() for unrecognized formats", () => {
    expect(applyTransforms({ date: "2024-03-15T00:00:00Z" }, makeDateTransform("UNKNOWN-FORMAT")).date).toBe(
      "2024-03-15"
    );
  });
});

describe("date-parse timezone and outputFormat handling", () => {
  it("should apply timezone offset when configured", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "YYYY-MM-DD",
        outputFormat: "ISO 8601",
        timezone: "America/New_York",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "2024-06-15" }, transforms);
    // UTC midnight interpreted as midnight Eastern (UTC-4 in June) should shift
    expect(result.date).toMatch(/^2024-06-15T04:00:00/);
  });

  it("should produce full ISO 8601 output when outputFormat is ISO 8601", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "ISO 8601",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "15/03/2024" }, transforms);
    expect(result.date).toBe("2024-03-15T00:00:00.000Z");
  });

  it("should default to date-only output when outputFormat is not ISO 8601", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "15/03/2024" }, transforms);
    expect(result.date).toBe("2024-03-15");
  });
});

describe("date-parse edge cases", () => {
  it("should skip date-parse when value is not a string", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "YYYY-MM-DD",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: 12345 }, transforms);
    expect(result.date).toBe(12345);
  });

  it("should skip date-parse when value is undefined", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "YYYY-MM-DD",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ other: "value" }, transforms);
    expect(result).not.toHaveProperty("date");
  });

  it("should keep original value when date parsing throws", () => {
    // Use an input that will cause an exception in Date constructor
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
        timezone: "Invalid/Timezone",
      },
    ];
    const result = applyTransforms({ date: "15/03/2024" }, transforms);
    // Should keep original since timezone parsing throws
    expect(result.date).toBe("15/03/2024");
  });

  it("should reject invalid dates like month 13", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "15/13/2024" }, transforms);
    // Invalid month 13 should be rejected
    expect(result.date).toBe("15/13/2024");
  });

  it("should handle NaN in date parts", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "abc/03/2024" }, transforms);
    // NaN part should cause rejection, keep original
    expect(result.date).toBe("abc/03/2024");
  });

  it("should leave already-formatted ISO dates unchanged when no timezone", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "date-parse",
        from: "date",
        inputFormat: "YYYY-MM-DD",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      },
    ];
    // Input is already in YYYY-MM-DD, output format is also YYYY-MM-DD, no timezone
    // The ISO_DATE_ONLY_REGEX check should keep it unchanged
    const result = applyTransforms({ date: "2024-03-15" }, transforms);
    expect(result.date).toBe("2024-03-15");
  });
});

describe("string-op edge cases", () => {
  it("should keep value unchanged when replace has no pattern", () => {
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "replace", active: true, autoDetected: false },
    ];
    const result = applyTransforms({ title: "hello" }, transforms);
    expect(result.title).toBe("hello");
  });

  it("should replace with empty string when no replacement specified", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "title",
        operation: "replace",
        pattern: "-",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ title: "hello-world" }, transforms);
    expect(result.title).toBe("helloworld");
  });

  it("should keep value unchanged for expression without expression string", () => {
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "expression", active: true, autoDetected: false },
    ];
    const result = applyTransforms({ title: "hello" }, transforms);
    expect(result.title).toBe("hello");
  });

  it("should return string result from expression that returns string", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "title",
        operation: "expression",
        expression: "upper(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ title: "hello" }, transforms);
    expect(result.title).toBe("HELLO");
  });
});

describe("string-op expression on numeric values", () => {
  it("should apply expression to numeric value", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "type",
        operation: "expression",
        expression: '(value == 1 ? "State-based" : value == 2 ? "Non-state" : value == 3 ? "One-sided" : value)',
        active: true,
        autoDetected: false,
      },
    ];
    expect(applyTransforms({ type: 1 }, transforms).type).toBe("State-based");
    expect(applyTransforms({ type: 2 }, transforms).type).toBe("Non-state");
    expect(applyTransforms({ type: 3 }, transforms).type).toBe("One-sided");
  });

  it("should return numeric value unchanged for non-matching expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "type",
        operation: "expression",
        expression: '(value == 99 ? "matched" : value)',
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ type: 5 }, transforms);
    expect(result.type).toBe(5);
  });

  it("should apply numeric comparison in expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "count",
        operation: "expression",
        expression: '(value > 50 ? "high" : "low")',
        active: true,
        autoDetected: false,
      },
    ];
    expect(applyTransforms({ count: 100 }, transforms).count).toBe("high");
    expect(applyTransforms({ count: 10 }, transforms).count).toBe("low");
  });

  it("should apply expression to boolean value", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "active",
        operation: "expression",
        expression: '(value ? "yes" : "no")',
        active: true,
        autoDetected: false,
      },
    ];
    expect(applyTransforms({ active: true }, transforms).active).toBe("yes");
    expect(applyTransforms({ active: false }, transforms).active).toBe("no");
  });

  it("should keep original numeric value when expression fails", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "count",
        operation: "expression",
        expression: "invalidFunc(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ count: 42 }, transforms);
    expect(result.count).toBe(42);
  });

  it("should skip expression when value is undefined", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "missing",
        operation: "expression",
        expression: "value + 1",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ other: "data" }, transforms);
    expect(result).not.toHaveProperty("missing");
  });

  it("should still skip uppercase/lowercase/replace on numeric values", () => {
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "count", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms({ count: 42 }, transforms);
    expect(result.count).toBe(42);
  });
});

describe("string-op to field support", () => {
  it("should write expression result to a different field via to", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "type",
        to: "type_label",
        operation: "expression",
        expression: '(value == 1 ? "State-based" : "Other")',
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ type: 1 }, transforms);
    expect(result.type_label).toBe("State-based");
    expect(result.type).toBe(1); // original preserved
  });

  it("should write uppercase result to a different field via to", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "name",
        to: "name_upper",
        operation: "uppercase",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ name: "hello" }, transforms);
    expect(result.name_upper).toBe("HELLO");
    expect(result.name).toBe("hello"); // original preserved
  });

  it("should write replace result to a different field via to", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "slug",
        to: "title",
        operation: "replace",
        pattern: "-",
        replacement: " ",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ slug: "hello-world" }, transforms);
    expect(result.title).toBe("hello world");
    expect(result.slug).toBe("hello-world"); // original preserved
  });

  it("should default to from field when to is not specified", () => {
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "name", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms({ name: "hello" }, transforms);
    expect(result.name).toBe("HELLO");
  });
});

describe("concatenate edge cases", () => {
  it("should stringify numbers and booleans in concatenation", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["name", "age", "active"],
        separator: "|",
        to: "combined",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ name: "John", age: 30, active: true }, transforms);
    expect(result.combined).toBe("John|30|true");
  });

  it("should skip object values in concatenation to avoid [object Object]", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["name", "nested"],
        separator: " ",
        to: "combined",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ name: "John", nested: { key: "val" } }, transforms);
    expect(result.combined).toBe("John");
  });

  it("should not set target field when all source fields are missing", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["missing1", "missing2"],
        separator: " ",
        to: "combined",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ other: "value" }, transforms);
    expect(result).not.toHaveProperty("combined");
  });
});

describe("parseDate and parseBool expressions", () => {
  it("should parse valid date string via parseDate expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "date",
        operation: "expression",
        expression: "parseDate(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "2024-03-15" }, transforms);
    expect(result.date).toMatch(/^2024-03-15T/);
  });

  it("should keep original on invalid date via parseDate expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "date",
        operation: "expression",
        expression: "parseDate(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ date: "not-a-date" }, transforms);
    expect(result.date).toBe("not-a-date");
  });

  it("should parse 'yes' as true via parseBool expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "active",
        operation: "expression",
        expression: "parseBool(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ active: "yes" }, transforms);
    expect(result.active).toBe(true);
  });

  it("should parse 'no' as false via parseBool expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "active",
        operation: "expression",
        expression: "parseBool(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ active: "no" }, transforms);
    expect(result.active).toBe(false);
  });

  it("should keep original on invalid boolean via parseBool expression", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "active",
        operation: "expression",
        expression: "parseBool(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyTransforms({ active: "maybe" }, transforms);
    expect(result.active).toBe("maybe");
  });

  it("should parse '1' as true and '0' as false via parseBool", () => {
    const transforms: IngestTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "val",
        operation: "expression",
        expression: "parseBool(value)",
        active: true,
        autoDetected: false,
      },
    ];
    expect(applyTransforms({ val: "1" }, transforms).val).toBe(true);
    expect(applyTransforms({ val: "0" }, transforms).val).toBe(false);
  });
});
