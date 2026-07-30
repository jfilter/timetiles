/**
 * Nested-schema comparison tests for `compareSchemas`.
 *
 * Detected schemas are nested objects, not dot-path-flattened maps. `compareSchemas`
 * originally walked only the top level, so a removed or retyped nested field produced
 * zero changes and `isBreaking: false` — auto-approving a genuinely breaking change.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import type { SchemaProperty } from "@/lib/services/schema-builder";
import { compareSchemas } from "@/lib/services/schema-builder";

describe("compareSchemas — nested objects", () => {
  // Detected schemas are nested, not flattened to dot paths. Comparing only the top level
  // saw a changed child as an unchanged `object` on both sides, so a breaking nested change
  // produced zero changes and auto-approved.
  const nested = (child: Record<string, SchemaProperty>, required: string[] = []): SchemaProperty => ({
    type: "object",
    properties: { user: { type: "object", properties: child, required } },
    required: [],
  });

  it("detects a removed nested field as breaking", () => {
    const result = compareSchemas(
      nested({ name: { type: "string" }, age: { type: "integer" } }),
      nested({ name: { type: "string" } })
    );

    expect(result.isBreaking).toBe(true);
    expect(result.changes).toContainEqual(
      expect.objectContaining({ type: "removed_field", path: "user.age", severity: "error" })
    );
  });

  it("detects a nested type change as breaking", () => {
    const result = compareSchemas(nested({ age: { type: "integer" } }), nested({ age: { type: "string" } }));

    expect(result.isBreaking).toBe(true);
    expect(result.changes).toContainEqual(
      expect.objectContaining({ type: "type_change", path: "user.age", severity: "error" })
    );
  });

  it("detects a nested field becoming required as breaking", () => {
    const result = compareSchemas(
      nested({ name: { type: "string" } }, []),
      nested({ name: { type: "string" } }, ["name"])
    );

    expect(result.isBreaking).toBe(true);
    expect(result.changes).toContainEqual(
      expect.objectContaining({ type: "format_change", path: "user.name", severity: "error" })
    );
  });

  it("descends into array items", () => {
    const withItems = (child: Record<string, SchemaProperty>): SchemaProperty => ({
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: child } } },
      required: [],
    });

    const result = compareSchemas(
      withItems({ sku: { type: "string" }, qty: { type: "integer" } }),
      withItems({ sku: { type: "string" } })
    );

    expect(result.isBreaking).toBe(true);
    expect(result.changes).toContainEqual(expect.objectContaining({ type: "removed_field", path: "items.qty" }));
  });

  it("reports no changes when nested shapes are identical", () => {
    const schema = nested({ name: { type: "string" }, age: { type: "integer" } });

    const result = compareSchemas(schema, structuredClone(schema));

    expect(result.changes).toHaveLength(0);
    expect(result.isBreaking).toBe(false);
  });

  it("compares a schema object shared by two sibling fields under both", () => {
    // The cycle guard must key on the ANCESTOR chain, not a global visited set: a shared
    // node legitimately reachable from two siblings has to be compared under each.
    const shared = (): SchemaProperty => ({ type: "object", properties: { id: { type: "string" } } });
    const oldChild = shared();
    const newChild: SchemaProperty = { type: "object", properties: { id: { type: "integer" } } };

    const result = compareSchemas(
      { type: "object", properties: { a: oldChild, b: oldChild } },
      { type: "object", properties: { a: newChild, b: newChild } }
    );

    expect(result.changes.map((c) => c.path).sort((x, y) => x.localeCompare(y))).toEqual(["a.id", "b.id"]);
  });

  it("terminates on a self-referential schema", () => {
    const cyclic: SchemaProperty = { type: "object", properties: {} };
    cyclic.properties = { self: cyclic, name: { type: "string" } };

    expect(() => compareSchemas(cyclic, cyclic)).not.toThrow();
  });

  it("does not report a type change for a schema stored before refs were inlined", () => {
    // Older stored schemas hold `{"$ref": "#/definitions/User"}` with the definitions gone.
    // Such a node carries no type information, so comparing it against a freshly inlined
    // object must not claim "unknown -> object" and mark every nested dataset as breaking.
    const stored: SchemaProperty = {
      type: "object",
      properties: { user: { $ref: "#/definitions/User" } },
      required: [],
    };
    const inlined = nested({ name: { type: "string" } });

    const result = compareSchemas(stored, inlined);

    expect(result.isBreaking).toBe(false);
    expect(result.changes).toHaveLength(0);
  });
});
