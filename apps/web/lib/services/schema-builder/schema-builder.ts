/**
 * Implements a service for progressively building a JSON schema from data samples.
 *
 * This class is designed to analyze records incrementally, typically in batches, to infer a
 * schema without needing to load the entire dataset into memory. It tracks statistics for
 * each field, such as data types, occurrence counts, and unique values.
 *
 * Key features:
 * - Processes data in batches to build up a schema over time.
 * - Uses `quicktype-core` to generate a formal JSON schema from data samples.
 * - Tracks field statistics and type conflicts.
 * - Can compare the generated schema against a previous version to detect changes.
 *
 * Note: Field mapping detection (title, timestamp, geo) is handled separately by
 * the schema detection plugin after all batches are processed.
 *
 * @module
 * @category Services
 */
import { InputData, jsonInputForTargetLanguage, quicktype } from "quicktype-core";

import { logger } from "@/lib/logger";
import { enrichEnumFields } from "@/lib/services/schema-detection/utilities";
import type { FieldStatistics, SchemaBuilderState, SchemaChange, SchemaComparison } from "@/lib/types/schema-detection";

import { createFieldStats, getValueType, updateFieldStats } from "./field-statistics";
import type { SchemaProperty } from "./schema-comparison";
import { compareSchemas } from "./schema-comparison";

/** A row of imported data. Values are genuinely untyped — CSV/Excel sources produce arbitrary field/value pairs. */
type DataRecord = Record<string, unknown>;

/** Default enum detection config — percentage mode scales across dataset sizes. */
export const DEFAULT_ENUM_CONFIG = { enumThreshold: 10, enumMode: "percentage" as const };

/** JSON-Schema `$ref` prefix quicktype emits for its named definitions. */
const DEFINITIONS_PREFIX = "#/definitions/";

/**
 * Inline every `#/definitions/...` reference so the schema stands on its own.
 *
 * Quicktype hoists each nested object into `definitions` and refers to it by `$ref`.
 * Downstream code (schema comparison, the categorical-filter UI, the stored dataset
 * schema) has no resolver, so an unresolved `$ref` is an opaque node whose shape is
 * simply lost. Inlining keeps the same information in a self-contained document.
 *
 * A recursive type (`Node` containing a `Node`) cannot be inlined finitely — those refs
 * are left intact, which is no worse than the previous behavior and terminates.
 */
const inlineSchemaRefs = (root: SchemaProperty): SchemaProperty => {
  const definitions = (root.definitions ?? {}) as Record<string, SchemaProperty>;

  const resolve = (node: unknown, expanding: readonly string[]): unknown => {
    if (Array.isArray(node)) return node.map((item) => resolve(item, expanding));
    if (node === null || typeof node !== "object") return node;

    const obj = node as SchemaProperty;
    const ref = typeof obj.$ref === "string" ? obj.$ref : undefined;

    if (ref?.startsWith(DEFINITIONS_PREFIX)) {
      const name = ref.slice(DEFINITIONS_PREFIX.length);
      const target = definitions[name];
      // Unknown target or a cycle: keep the ref rather than looping forever.
      if (!target || expanding.includes(name)) return { ...obj };
      return resolve(target, [...expanding, name]);
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "definitions") continue; // hoisted away by the inlining
      out[key] = resolve(value, expanding);
    }
    return out;
  };

  return resolve(root, []) as SchemaProperty;
};

export class ProgressiveSchemaBuilder {
  private readonly state: SchemaBuilderState;
  private readonly config: {
    maxSamples: number;
    maxUniqueValues: number;
    enumThreshold: number;
    enumMode: "count" | "percentage";
    maxDepth: number;
  };

  constructor(initialState?: SchemaBuilderState, config?: Partial<ProgressiveSchemaBuilder["config"]>) {
    // Callers pass `{ enumThreshold: dataset?.… ?? undefined }` — spreading
    // explicitly-undefined keys would clobber the defaults with undefined and
    // turn the enum threshold comparisons into always-false NaN checks.
    const overrides = Object.fromEntries(
      // Cast through unknown: Object.entries types the values as non-undefined
      // even though the runtime values of a Partial<> regularly are.
      Object.entries((config ?? {}) as Record<string, unknown>).filter(([, value]) => value !== undefined)
    ) as Partial<ProgressiveSchemaBuilder["config"]>;
    this.config = { maxSamples: 100, maxUniqueValues: 100, ...DEFAULT_ENUM_CONFIG, maxDepth: 3, ...overrides };

    this.state = initialState ?? {
      version: 0,
      fieldStats: {},
      recordCount: 0,
      batchCount: 0,
      lastUpdated: new Date(),
      dataSamples: [],
      maxSamples: this.config.maxSamples,
      typeConflicts: [],
    };
  }

  processBatch(records: DataRecord[]): { schemaChanged: boolean; changes: SchemaChange[] } {
    const changes: SchemaChange[] = [];

    // Update samples (rotating buffer)
    this.updateSamples(records);

    // Process each record
    for (const record of records) {
      const recordChanges = this.processRecord(record, "");
      changes.push(...recordChanges);
    }

    // Update counts
    this.state.recordCount += records.length;
    this.state.batchCount++;
    this.state.lastUpdated = new Date();

    // Note: Pattern detection (enums, geo, ID) runs once at end, not per-batch

    // Increment version if schema changed
    const schemaChanged = changes.some((c) => c.type === "new_field" || c.type === "type_change");

    if (schemaChanged) {
      this.state.version++;
    }

    return { schemaChanged, changes };
  }

  private handleNewField(fieldPath: string, value: unknown): SchemaChange {
    this.state.fieldStats[fieldPath] = createFieldStats(fieldPath);
    return {
      type: "new_field",
      path: fieldPath,
      details: { dataType: getValueType(value) },
      severity: "info",
      autoApprovable: true,
    };
  }

  private checkTypeConflict(
    fieldPath: string,
    stats: FieldStatistics,
    newType: string,
    value: unknown
  ): SchemaChange | null {
    if (stats.occurrences === 0) return null;

    const hasExistingType = (stats.typeDistribution[newType] ?? 0) > 0;
    const hasOtherTypes = Object.keys(stats.typeDistribution).some(
      (t) => t !== newType && t !== "null" && t !== "undefined" && (stats.typeDistribution[t] ?? 0) > 0
    );

    if (!hasExistingType && hasOtherTypes) {
      const oldType = Object.keys(stats.typeDistribution).find(
        (t) => t !== "null" && t !== "undefined" && (stats.typeDistribution[t] ?? 0) > 0
      );

      this.updateTypeConflict(fieldPath, stats, newType, value);

      return {
        type: "type_change",
        path: fieldPath,
        details: { oldType, newType },
        severity: "warning",
        autoApprovable: false,
      };
    }

    return null;
  }

  private updateTypeConflict(fieldPath: string, stats: FieldStatistics, newType: string, value: unknown): void {
    let conflict = this.state.typeConflicts.find((c) => c.path === fieldPath);

    if (conflict) {
      // Update existing conflict - increment count for the new type
      conflict.types[newType] = (conflict.types[newType] ?? 0) + 1;
    } else {
      conflict = { path: fieldPath, types: {}, samples: [] };

      // Add all existing non-null types
      for (const [type, count] of Object.entries(stats.typeDistribution)) {
        if (type !== "null" && type !== "undefined" && count > 0) {
          conflict.types[type] = count;
        }
      }

      // Add the new conflicting type with count 1
      conflict.types[newType] = 1;
      this.state.typeConflicts.push(conflict);
    }

    if (conflict.samples.length < 5) {
      conflict.samples.push({ type: newType, value });
    }
  }

  private processNestedValue(value: unknown, fieldPath: string, depth: number): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Recursively process nested objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nestedChanges = this.processRecord(value, fieldPath, depth + 1);
      changes.push(...nestedChanges);
    }

    // Process array items (sample first item)
    if (Array.isArray(value) && value.length > 0) {
      const firstItem = value[0];
      if (typeof firstItem === "object" && firstItem !== null) {
        const itemPath = `${fieldPath}[]`;
        const nestedChanges = this.processRecord(firstItem, itemPath, depth + 1);
        changes.push(...nestedChanges);
      }
    }

    return changes;
  }

  private processRecord(obj: unknown, pathPrefix: string, depth: number = 0): SchemaChange[] {
    const changes: SchemaChange[] = [];

    if (depth >= this.config.maxDepth) return changes;

    for (const [key, value] of Object.entries(obj ?? {})) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Initialize field stats if new
      if (!this.state.fieldStats[fieldPath]) {
        changes.push(this.handleNewField(fieldPath, value));
      }

      const stats = this.state.fieldStats[fieldPath]!; // Safe after initialization above
      const newType = getValueType(value);

      // Check for type conflicts BEFORE updating stats
      const typeChange = this.checkTypeConflict(fieldPath, stats, newType, value);
      if (typeChange) {
        changes.push(typeChange);
      }

      // Update field statistics
      updateFieldStats(stats, value, this.config.maxUniqueValues);

      // Process nested values
      const nestedChanges = this.processNestedValue(value, fieldPath, depth);
      changes.push(...nestedChanges);
    }

    return changes;
  }

  private updateSamples(records: DataRecord[]): void {
    // Add new records
    this.state.dataSamples.push(...records);

    // Keep only the last maxSamples records (FIFO)
    if (this.state.dataSamples.length > this.config.maxSamples) {
      // Remove oldest records from the beginning
      this.state.dataSamples = this.state.dataSamples.slice(-this.config.maxSamples);
    }
  }

  async getSchema(): Promise<SchemaProperty> {
    if (this.state.dataSamples.length === 0) {
      return { type: "object", properties: {}, required: [], additionalProperties: false };
    }

    try {
      // Use quicktype to generate schema from samples
      const jsonInput = jsonInputForTargetLanguage("schema");

      await jsonInput.addSource({ name: "DataSample", samples: this.state.dataSamples.map((s) => JSON.stringify(s)) });

      const inputData = new InputData();
      inputData.addInput(jsonInput);

      const result = await quicktype({
        inputData,
        lang: "schema",
        inferEnums: true,
        inferDateTimes: true,
        inferIntegerStrings: false,
        alphabetizeProperties: true,
      });

      const schemaString = result.lines.join("\n");
      let schema: SchemaProperty;

      try {
        schema = JSON.parse(schemaString) as SchemaProperty;
      } catch (parseError) {
        logger.error("Failed to parse quicktype output", { schemaString, parseError });
        return this.buildManualSchema();
      }

      // Quicktype emits every nested object as a named entry in `definitions` and refers to
      // it by `$ref`. Resolving ONLY the top-level ref and then dropping `definitions` left
      // dangling refs behind: a nested field like `user` was stored as
      // `{"$ref": "#/definitions/User"}` with nothing to resolve it against, so its shape
      // was lost — schema comparison could not see nested fields at all, and a breaking
      // nested change auto-approved. Inline the whole graph so the stored schema is
      // self-contained.
      schema = inlineSchemaRefs(schema);

      // Ensure schema has the required top-level structure
      schema.type ??= "object";
      schema.properties ??= {};

      // For first import (no current schema), mark all fields as optional
      // Only mark fields as required if they appear in 90%+ of records.
      //
      // Only TOP-LEVEL names belong here. `fieldStats` is keyed by dot-path, and pushing
      // "user.name" into the root `required` is invalid JSON Schema — nothing at the root
      // is named that. Requiredness for nested fields comes from the inlined definitions.
      const required: string[] = [];
      for (const [field, stats] of Object.entries(this.state.fieldStats)) {
        if (!field.includes(".") && stats.occurrences >= this.state.recordCount * 0.9) {
          required.push(field);
        }
      }
      schema.required = required;

      // Enhance with our field statistics
      this.enhanceSchemaWithStats(schema);

      return schema;
    } catch (error) {
      logger.error("Failed to generate schema", { error });
      return this.buildManualSchema();
    }
  }

  private enhanceSchemaWithStats(schema: SchemaProperty): void {
    const { properties } = schema;

    if (!properties) return;

    for (const [field, stats] of Object.entries(this.state.fieldStats)) {
      const prop = this.getNestedProperty(properties, field);

      if (prop && stats.isEnumCandidate && stats.enumValues) {
        prop.enum = stats.enumValues.map((ev) => ev.value);
      }

      // Add format hints
      if (prop && stats.typeDistribution["date"] && stats.typeDistribution["date"] > 0) {
        prop.format = "date-time";
      }

      // Add constraints from numeric stats
      if (prop && stats.numericStats) {
        prop.minimum = stats.numericStats.min;
        prop.maximum = stats.numericStats.max;
      }
    }
  }

  private processArrayPart(current: unknown, fieldName: string): unknown {
    if (typeof current !== "object" || current === null || !(fieldName in current)) {
      return null;
    }

    const field = (current as Record<string, unknown>)[fieldName];
    if (typeof field !== "object" || field === null || !("items" in field)) {
      return null;
    }

    const items = field.items;
    if (typeof items === "object" && items !== null && "properties" in items) {
      return items.properties;
    }
    return items;
  }

  private processObjectPart(current: unknown, part: string): unknown {
    if (typeof current === "object" && current !== null && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return null;
  }

  /**
   * Step from a schema node into its `properties` map.
   *
   * Every part of the path except the last one names a container, and the value looked up
   * for it is the container's schema node (`{type:"object", properties:{…}}`), not the map
   * of its children. Without this step the next part was searched in the node itself, so
   * `user.age` never resolved and nested fields silently lost their statistics-derived
   * `minimum`/`maximum`, enums and date hints. The array branch already descends into
   * `items.properties`, which is what made the asymmetry an oversight rather than a design.
   *
   * Returning null (rather than the node) when there is no `properties` map matters: a node
   * like `{type:"object"}` would otherwise let the next part match one of the schema's own
   * keywords, and `prop.minimum = …` on the resulting string throws in strict mode.
   */
  private static descendIntoProperties(node: unknown): unknown {
    if (typeof node !== "object" || node === null) return null;
    const nested = (node as { properties?: unknown }).properties;
    return typeof nested === "object" && nested !== null ? nested : null;
  }

  private getNestedProperty(properties: Record<string, SchemaProperty>, path: string): SchemaProperty | null {
    // No filtering of empty parts: `""` is a legal JSON key and `processRecord` records it
    // verbatim, so dropping it would leave an empty path that resolves to the whole
    // properties map — and the caller would then write `minimum`/`enum` into that map.
    const parts = path.split(".");
    let current: unknown = properties;

    for (const [index, part] of parts.entries()) {
      const isLast = index === parts.length - 1;

      if (part.endsWith("[]")) {
        const fieldName = part.slice(0, -2);
        current = this.processArrayPart(current, fieldName);
      } else {
        current = this.processObjectPart(current, part);
        if (!isLast) {
          current = ProgressiveSchemaBuilder.descendIntoProperties(current);
        }
      }

      if (current === null) {
        return null;
      }
    }

    if (typeof current !== "object" || current === null) {
      return null;
    }

    return current as SchemaProperty;
  }

  private createArrayProperty(): SchemaProperty {
    return { type: "array", items: { type: "object", properties: {} } };
  }

  private createObjectProperty(): SchemaProperty {
    return { type: "object", properties: {} };
  }

  /**
   * Return the child-property bag for an array field, creating or repairing the
   * container as needed.
   *
   * Field statistics record both the array field itself (`items`) and its item
   * fields (`items[].a`). The leaf entry is visited first and produces a plain
   * `{ type: "array" }` schema with no `items`, so descending blindly would
   * dereference `undefined`.
   */
  private descendIntoArray(current: Record<string, SchemaProperty>, fieldName: string): Record<string, SchemaProperty> {
    const existing = current[fieldName];
    if (existing === undefined) {
      current[fieldName] = this.createArrayProperty();
    } else {
      existing.type ??= "array";
      const items = existing.items;
      if (items == null || typeof items !== "object") {
        existing.items = { type: "object", properties: {} };
      } else {
        (items as SchemaProperty).type ??= "object";
        (items as SchemaProperty).properties ??= {};
      }
    }
    return (current[fieldName]!.items as { properties: Record<string, SchemaProperty> }).properties;
  }

  /**
   * Return the child-property bag for an object field, creating or repairing
   * the container as needed (see {@link descendIntoArray}).
   */
  private descendIntoObject(
    current: Record<string, SchemaProperty>,
    fieldName: string
  ): Record<string, SchemaProperty> {
    const existing = current[fieldName];
    if (existing === undefined) {
      current[fieldName] = this.createObjectProperty();
    } else {
      existing.type ??= "object";
      existing.properties ??= {};
    }
    return current[fieldName]!.properties!;
  }

  /**
   * Write the leaf schema for a field without discarding any container shape a
   * previously-visited child path already built underneath it.
   */
  private setLeafProperty(current: Record<string, SchemaProperty>, part: string, stats: FieldStatistics): void {
    const built = this.buildPropertySchema(stats);
    const existing = current[part];
    if (existing?.properties !== undefined) built.properties = existing.properties;
    if (existing?.items !== undefined) built.items = existing.items;
    current[part] = built;
  }

  private processFieldPath(
    properties: Record<string, SchemaProperty>,
    fieldPath: string,
    stats: FieldStatistics,
    required: string[]
  ): void {
    const parts = fieldPath.split(".").filter((p) => p !== "");
    let current: Record<string, SchemaProperty> = properties;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;

      if (part.endsWith("[]")) {
        current = this.descendIntoArray(current, part.slice(0, -2));
      } else if (isLast) {
        this.setLeafProperty(current, part, stats);
        // Mark as required if appears in most records
        if (stats.occurrences >= this.state.recordCount * 0.9) {
          required.push(part);
        }
      } else {
        current = this.descendIntoObject(current, part);
      }
    }
  }

  private buildManualSchema(): SchemaProperty {
    const properties: Record<string, SchemaProperty> = {};
    const required: string[] = [];

    for (const [fieldPath, stats] of Object.entries(this.state.fieldStats)) {
      this.processFieldPath(properties, fieldPath, stats, required);
    }

    return { type: "object", properties, required, additionalProperties: false };
  }

  private buildPropertySchema(stats: FieldStatistics): SchemaProperty {
    const schema: SchemaProperty = {};

    // Determine primary type from type distribution
    const typeEntries = Object.entries(stats.typeDistribution)
      .filter(([type]) => type !== "null" && type !== "undefined")
      .sort(([, a], [, b]) => b - a);

    if (typeEntries.length === 1 && typeEntries[0]) {
      schema.type = this.mapToJsonSchemaType(typeEntries[0][0]);
    } else if (typeEntries.length > 1) {
      // Multiple types - create union
      const types = typeEntries.map(([type]) => this.mapToJsonSchemaType(type));

      if (stats.nullCount > 0) {
        schema.type = [...new Set(types)];
        schema.nullable = true;
      } else {
        schema.type = types.length === 1 ? types[0] : types;
      }
    }

    // Add enum if detected
    if (stats.isEnumCandidate && stats.enumValues) {
      schema.enum = stats.enumValues.map((ev) => ev.value);
    }

    // Add constraints from numeric stats
    if (stats.numericStats) {
      schema.minimum = stats.numericStats.min;
      schema.maximum = stats.numericStats.max;
    }

    return schema;
  }

  private mapToJsonSchemaType(type: string): string {
    const typeMap: Record<string, string> = {
      string: "string",
      number: "number",
      integer: "integer",
      boolean: "boolean",
      object: "object",
      array: "array",
      null: "null",
      date: "string",
      "boolean-string": "string",
    };

    return typeMap[type] ?? "string";
  }

  compareWithPrevious(previousSchema: SchemaProperty): SchemaComparison {
    const currentSchema = this.getSchemaSync();
    return compareSchemas(previousSchema, currentSchema);
  }

  getSchemaSync(): SchemaProperty {
    return this.buildManualSchema();
  }

  getState(): SchemaBuilderState {
    return { ...this.state };
  }

  getFieldStatistics(): Record<string, FieldStatistics> {
    return { ...this.state.fieldStats };
  }

  /**
   * Finalize field statistics and detect enum candidates.
   * Call once after all batches are processed.
   */
  detectEnumFields(): void {
    // Calculate occurrencePercent before enum detection — downstream consumers
    // (e.g. the categorical filter UI) filter on occurrencePercent >= 50.
    if (this.state.recordCount > 0) {
      for (const stats of Object.values(this.state.fieldStats)) {
        stats.occurrencePercent = (stats.occurrences / this.state.recordCount) * 100;
      }
    }

    enrichEnumFields(this.state.fieldStats, this.config);
  }

  getSummary(): { recordCount: number; fieldCount: number; version: number; enumFields: string[] } {
    const enumFields = Object.entries(this.state.fieldStats)
      .filter(([, stats]) => stats.isEnumCandidate)
      .map(([field]) => field);

    return {
      recordCount: this.state.recordCount,
      fieldCount: Object.keys(this.state.fieldStats).length,
      version: this.state.version,
      enumFields,
    };
  }
}
