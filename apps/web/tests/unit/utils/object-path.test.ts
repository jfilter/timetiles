/**
 * Unit tests for the dot-notation path helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  deleteByPath,
  deleteByPathOrKey,
  getByPath,
  getByPathOrKey,
  setByPath,
  setByPathOrKey,
} from "@/lib/utils/object-path";

describe.sequential("object-path", () => {
  describe("getByPath", () => {
    it("walks nested objects and returns undefined for missing segments", () => {
      expect(getByPath({ user: { email: "a@b.c" } }, "user.email")).toBe("a@b.c");
      expect(getByPath({ user: {} }, "user.phone")).toBeUndefined();
      expect(getByPath(null, "user.email")).toBeUndefined();
    });

    it("never traverses inherited keys", () => {
      expect(getByPath({}, "__proto__.toString")).toBeUndefined();
      expect(getByPath({}, "constructor.name")).toBeUndefined();
    });
  });

  describe("getByPathOrKey", () => {
    it("prefers a literal dotted key over traversal", () => {
      expect(getByPathOrKey({ "a.b": 1, a: { b: 2 } }, "a.b")).toBe(1);
      expect(getByPathOrKey({ a: { b: 2 } }, "a.b")).toBe(2);
    });
  });

  describe("setByPath", () => {
    it("creates intermediate objects", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, "user.email", "a@b.c");
      expect(obj).toEqual({ user: { email: "a@b.c" } });
    });

    it("rejects unsafe segments", () => {
      expect(() => setByPath({}, "__proto__.polluted", 1)).toThrow(/Unsafe path segment/);
    });
  });

  describe("deleteByPath", () => {
    it("removes the value at a nested path", () => {
      const obj: Record<string, unknown> = { user: { email: "a@b.c", name: "John" } };
      deleteByPath(obj, "user.email");
      expect(obj).toEqual({ user: { name: "John" } });
    });

    it("does nothing for a missing path", () => {
      const obj: Record<string, unknown> = { user: { name: "John" } };
      deleteByPath(obj, "user.email.deep");
      expect(obj).toEqual({ user: { name: "John" } });
    });

    it("refuses to walk into the prototype", () => {
      // Transform paths are user-configured; without the guard this deletes off Object.prototype.
      const obj: Record<string, unknown> = {};
      deleteByPath(obj, "__proto__.toString");
      expect(Object.hasOwn(Object.prototype, "toString")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, "toString")).toBe(true);
    });

    it("refuses an unsafe last segment", () => {
      const obj: Record<string, unknown> = { nested: {} };
      deleteByPath(obj, "nested.__proto__");
      expect(Object.getPrototypeOf(obj.nested)).toBe(Object.prototype);
    });
  });

  describe("setByPathOrKey", () => {
    it("writes simple and dotted keys", () => {
      const obj: Record<string, unknown> = { "a.b": 1 };
      setByPathOrKey(obj, "a.b", 2);
      setByPathOrKey(obj, "plain", 3);
      expect(obj).toEqual({ "a.b": 2, plain: 3 });
    });

    it("stores a __proto__ column as an own property instead of re-parenting the row", () => {
      const obj: Record<string, unknown> = {};
      setByPathOrKey(obj, "__proto__", { polluted: true });

      expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
      expect(Object.hasOwn(obj, "__proto__")).toBe(true);
      expect({} as Record<string, unknown>).not.toHaveProperty("polluted");
    });

    it("treats constructor and prototype as ordinary column names", () => {
      // A source file may have such a header; throwing here would fail the whole
      // import, and a plain own-property write is harmless.
      const obj: Record<string, unknown> = {};
      setByPathOrKey(obj, "constructor", "c");
      setByPathOrKey(obj, "prototype", "p");

      expect(obj.constructor).toBe("c");
      expect(obj.prototype).toBe("p");
      expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
    });
  });

  describe("deleteByPathOrKey", () => {
    it("removes a literal dotted key before traversing", () => {
      const obj: Record<string, unknown> = { "a.b": 1, a: { b: 2 } };
      deleteByPathOrKey(obj, "a.b");
      expect(obj).toEqual({ a: { b: 2 } });
    });
  });
});
