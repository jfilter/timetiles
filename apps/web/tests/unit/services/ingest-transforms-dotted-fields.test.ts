/**
 * Unit tests for dotted field handling across path helpers and ingest transforms.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { applyPreviewTransforms, applyTransforms, applyTransformsBatch } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import {
  deleteByPath,
  deleteByPathOrKey,
  getByPath,
  getByPathOrKey,
  setByPath,
  setByPathOrKey,
} from "@/lib/utils/object-path";

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

  describe("getByPathOrKey", () => {
    it("should prefer literal dotted keys over nested traversal", () => {
      const obj = { "user.email": "flattened@example.com", user: { email: "nested@example.com" } };

      expect(getByPathOrKey(obj, "user.email")).toBe("flattened@example.com");
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

  describe("setByPathOrKey", () => {
    it("should update an existing literal dotted key directly", () => {
      const obj: Record<string, unknown> = { "user.email": "old@example.com" };

      setByPathOrKey(obj, "user.email", "new@example.com");

      expect(obj).toEqual({ "user.email": "new@example.com" });
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
      deleteByPath(obj, "user.phone");
      expect(obj).toEqual({ user: { email: "john@example.com" } });
    });

    it("should not delete parent objects", () => {
      const obj: Record<string, unknown> = { user: { email: "john@example.com", name: "John" } };
      deleteByPath(obj, "user.email");
      expect(obj.user).toBeDefined();
      expect(obj.user).toEqual({ name: "John" });
    });
  });

  describe("deleteByPathOrKey", () => {
    it("should delete an existing literal dotted key directly", () => {
      const obj: Record<string, unknown> = {
        "user.email": "flattened@example.com",
        user: { email: "nested@example.com" },
      };

      deleteByPathOrKey(obj, "user.email");

      expect(obj).toEqual({ user: { email: "nested@example.com" } });
    });
  });
});

describe("dotted field transform regressions", () => {
  it("should rename flattened dotted keys without treating them as nested paths", () => {
    const data = { "user.name": "Flattened User", user: { name: "Nested User" } };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "user.name", to: "title", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);

    expect(result).toEqual({ user: { name: "Nested User" }, title: "Flattened User" });
  });

  it("should keep literal dotted keys when writing back to the same field", () => {
    const data = { "user.name": "john" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "user.name", operation: "uppercase", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);

    expect(result).toEqual({ "user.name": "JOHN" });
  });

  it("should transform flattened dotted headers across batches", () => {
    const rows = [{ "user.name": "alpha" }, { "user.name": "beta" }];
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "user.name", operation: "uppercase", active: true, autoDetected: false },
    ];

    expect(applyTransformsBatch(rows, transforms)).toEqual([{ "user.name": "ALPHA" }, { "user.name": "BETA" }]);
  });

  it("should transform flattened dotted headers in preview mode", () => {
    const rows = [{ "user.name": "preview user" }];
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "user.name", operation: "uppercase", active: true, autoDetected: false },
    ];

    expect(applyPreviewTransforms(rows, transforms)).toEqual([{ "user.name": "PREVIEW USER" }]);
  });
});
