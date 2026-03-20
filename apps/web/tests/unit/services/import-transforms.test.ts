/**
 * Unit tests for import transform service.
 *
 * Tests the path utilities and transform application logic.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { applyTransforms, applyTransformsBatch } from "@/lib/import/transforms";
import type { ImportTransform } from "@/lib/types/import-transforms";
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
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ start_date: "2024-01-15", name: "Event" });
    expect(result).not.toHaveProperty("date");
  });

  it("should apply nested path rename", () => {
    const data = { user: { email: "john@example.com", name: "John" } };
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "user.email", to: "contact.email", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ user: { name: "John" }, contact: { email: "john@example.com" } });
  });

  it("should apply multiple transforms", () => {
    const data = { date: "2024-01-15", author: "John", title: "Event" };
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
      { id: "2", type: "rename", from: "author", to: "creator", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ start_date: "2024-01-15", creator: "John", title: "Event" });
  });

  it("should skip inactive transforms", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: false, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ date: "2024-01-15", name: "Event" });
  });

  it("should skip transforms for non-existent fields", () => {
    const data = { name: "Event" };
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ name: "Event" });
    expect(result).not.toHaveProperty("start_date");
  });

  it("should not mutate original data", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const original = { ...data };
    const transforms: ImportTransform[] = [
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

    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "event.date", to: "start_date", active: true, autoDetected: false },
      { id: "2", type: "rename", from: "event.location.coords.lat", to: "latitude", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.start_date).toBe("2024-01-15");
    expect(result.latitude).toBe(40.7);
    expect(getByPath(result, "event.date")).toBeUndefined();
    expect(getByPath(result, "event.location.coords.lat")).toBeUndefined();
  });

  it("should leave blank strings unchanged when parsing numbers", () => {
    const data = { count: "" };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "type-cast",
        from: "count",
        fromType: "string",
        toType: "number",
        strategy: "parse",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.count).toBe("");
  });

  it("should trim boolean strings before parsing", () => {
    const data = { active: " yes " };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "type-cast",
        from: "active",
        fromType: "string",
        toType: "boolean",
        strategy: "parse",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.active).toBe(true);
  });

  it("should leave impossible ISO dates unchanged", () => {
    const data = { date: "2024-02-30" };
    const transforms: ImportTransform[] = [
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

  it("should parse custom boolean helpers consistently", () => {
    const data = { active: "false" };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "type-cast",
        from: "active",
        fromType: "string",
        toType: "boolean",
        strategy: "custom",
        customFunction: "parseBool(value)",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.active).toBe(false);
  });

  it("should leave impossible dates unchanged when type-casting to date", () => {
    const data = { date: "2024-02-30" };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "type-cast",
        from: "date",
        fromType: "string",
        toType: "date",
        strategy: "parse",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.date).toBe("2024-02-30");
  });

  it("should apply uppercase string-op transform", () => {
    const data = { title: "hello world" };
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.title).toBe("HELLO WORLD");
  });

  it("should apply lowercase string-op transform", () => {
    const data = { title: "HELLO WORLD" };
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "lowercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.title).toBe("hello world");
  });

  it("should apply trim string-op transform", () => {
    const data = { title: "  hello world  " };
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "title", operation: "trim", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.title).toBe("hello world");
  });

  it("should apply replace string-op transform", () => {
    const data = { title: "hello-world-2024" };
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "count", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyTransforms(data, transforms);
    expect(result.count).toBe(42);
  });

  it("should apply concatenate transform", () => {
    const data = { first: "John", last: "Doe", age: 30 };
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const data = { full_name: "  john doe  ", date: "15/03/2024" };
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "full_name", operation: "trim", active: true, autoDetected: false },
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
    expect(result.first).toBe("john");
    expect(result.last).toBe("doe");
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

    const transforms: ImportTransform[] = [
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

    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "date", to: "start_date", active: true, autoDetected: false },
    ];

    applyTransformsBatch(data, transforms);
    expect(data).toEqual(original);
  });
});

describe("date-parse inputFormat handling", () => {
  const makeDateTransform = (inputFormat: string): ImportTransform[] => [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
    const transforms: ImportTransform[] = [
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
