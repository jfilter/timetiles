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

/**
 * `enhanceSchemaWithStats` walks the generated schema by dot-path to attach the
 * statistics quicktype cannot infer. The walker looked each part up directly in
 * the previous part's schema NODE instead of stepping into its `properties` map,
 * so nothing below the top level was ever reached.
 */
describe("ProgressiveSchemaBuilder statistics on nested fields", () => {
  const records = Array.from({ length: 10 }, (_, index) => ({
    age: 20 + index,
    user: { age: 30 + index },
    items: [{ qty: 40 + index }],
  }));

  it("attaches numeric constraints to nested object fields", async () => {
    const builder = new ProgressiveSchemaBuilder();
    builder.processBatch(records);

    const props = propertiesOf(await builder.getSchema());

    expect(props.age).toMatchObject({ minimum: 20, maximum: 29 });
    expect(propertiesOf(props.user).age).toMatchObject({ minimum: 30, maximum: 39 });
  });

  it("attaches numeric constraints to fields inside arrays of objects", async () => {
    const builder = new ProgressiveSchemaBuilder();
    builder.processBatch(records);

    const props = propertiesOf(await builder.getSchema());

    expect(propertiesOf(props.items!.items).qty).toMatchObject({ minimum: 40, maximum: 49 });
  });

  it("resolves a nested field whose name collides with a schema keyword", async () => {
    const builder = new ProgressiveSchemaBuilder();
    // A child literally named `type` must resolve through `user.properties`, not against the
    // node's own `type` keyword — that would land on the string "object", and assigning a
    // constraint to a string primitive throws in strict mode.
    builder.processBatch(records.map((record) => ({ ...record, user: { ...record.user, type: 5 } })));

    const props = propertiesOf(await builder.getSchema());

    expect(propertiesOf(props.user).type).toMatchObject({ minimum: 5, maximum: 5 });
    expect(props.user!.type).toBe("object");
  });
});
