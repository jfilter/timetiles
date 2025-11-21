/**
 * Unit tests for import transform service.
 *
 * Tests the path utilities and transform application logic.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  applyTransforms,
  applyTransformsBatch,
  deleteByPath,
  getByPath,
  setByPath,
} from "@/lib/services/import-transforms";
import type { ImportTransform } from "@/lib/types/import-transforms";

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
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ start_date: "2024-01-15", name: "Event" });
    expect(result).not.toHaveProperty("date");
  });

  it("should apply nested path rename", () => {
    const data = { user: { email: "john@example.com", name: "John" } };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "user.email",
        to: "contact.email",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({
      user: { name: "John" },
      contact: { email: "john@example.com" },
    });
  });

  it("should apply multiple transforms", () => {
    const data = { date: "2024-01-15", author: "John", title: "Event" };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
      {
        id: "2",
        type: "rename",
        from: "author",
        to: "creator",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ start_date: "2024-01-15", creator: "John", title: "Event" });
  });

  it("should skip inactive transforms", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: false,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ date: "2024-01-15", name: "Event" });
  });

  it("should skip transforms for non-existent fields", () => {
    const data = { name: "Event" };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result).toEqual({ name: "Event" });
    expect(result).not.toHaveProperty("start_date");
  });

  it("should not mutate original data", () => {
    const data = { date: "2024-01-15", name: "Event" };
    const original = { ...data };
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
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
    const data = {
      event: {
        date: "2024-01-15",
        location: {
          city: "NYC",
          coords: { lat: 40.7, lng: -74.0 },
        },
      },
    };

    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "event.date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
      {
        id: "2",
        type: "rename",
        from: "event.location.coords.lat",
        to: "latitude",
        active: true,
        autoDetected: false,
      },
    ];

    const result = applyTransforms(data, transforms);
    expect(result.start_date).toBe("2024-01-15");
    expect(result.latitude).toBe(40.7);
    expect(getByPath(result, "event.date")).toBeUndefined();
    expect(getByPath(result, "event.location.coords.lat")).toBeUndefined();
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
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
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
    const original = JSON.parse(JSON.stringify(data));

    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "rename",
        from: "date",
        to: "start_date",
        active: true,
        autoDetected: false,
      },
    ];

    applyTransformsBatch(data, transforms);
    expect(data).toEqual(original);
  });
});
