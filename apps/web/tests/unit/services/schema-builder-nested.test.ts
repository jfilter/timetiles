/**
 * Regression tests for the manual (non-quicktype) schema build over nested data.
 *
 * Field statistics hold both a container path ("user", "items") and its child
 * paths ("user.name", "items[].sku"). The container is visited first and turned
 * into a leaf schema with no `properties`/`items`, so descending into it has to
 * repair the container. Dereferencing it blindly threw a TypeError, which took
 * out `getSchemaSync()` and the error fallback inside `getSchema()` — the very
 * path that is supposed to keep working when quicktype fails.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";

type Props = Record<string, Record<string, unknown>>;

const propertiesOf = (value: unknown): Props => (value as { properties: Props }).properties;

describe("ProgressiveSchemaBuilder manual schema for nested data", () => {
  it("builds a nested object schema without throwing", () => {
    const builder = new ProgressiveSchemaBuilder();
    builder.processBatch([{ user: { name: "Alice", age: 30 } }, { user: { name: "Bob", age: 25 } }]);

    const schema = builder.getSchemaSync();
    const props = schema.properties as Props;

    expect(props.user!.type).toBe("object");
    expect(propertiesOf(props.user).name!.type).toBe("string");
    expect(propertiesOf(props.user).age!.type).toBe("integer");
  });

  it("builds an array-of-objects schema without throwing", () => {
    const builder = new ProgressiveSchemaBuilder();
    builder.processBatch([{ items: [{ sku: "a", qty: 1 }] }, { items: [{ sku: "b", qty: 2 }] }]);

    const schema = builder.getSchemaSync();
    const props = schema.properties as Props;

    expect(props.items!.type).toBe("array");
    expect(propertiesOf(props.items!.items).sku!.type).toBe("string");
    expect(propertiesOf(props.items!.items).qty!.type).toBe("integer");
  });

  it("keeps deeply nested children intact", () => {
    const builder = new ProgressiveSchemaBuilder();
    builder.processBatch([{ meta: { a: 1, b: { c: "x" } } }]);

    const schema = builder.getSchemaSync();
    const props = schema.properties as Props;

    expect(propertiesOf(props.meta).a!.type).toBe("integer");
    expect(propertiesOf(propertiesOf(props.meta).b).c!.type).toBe("string");
  });
});
