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
 * - Detects potential ID fields, geographic coordinate fields, and enumerations (enums).
 * - Tracks field statistics and type conflicts.
 * - Can compare the generated schema against a previous version to detect changes.
 *
 * @module
 * @category Services
 */
import { InputData, jsonInputForTargetLanguage, quicktype } from "quicktype-core";

import { logger } from "@/lib/logger";
import type { FieldStatistics, SchemaBuilderState, SchemaChange, SchemaComparison } from "@/lib/types/schema-detection";

import { createFieldStats, getValueType, updateFieldStats } from "./field-statistics";
import { detectEnums, detectGeoFields, detectIdFields } from "./pattern-detection";
import { compareSchemas } from "./schema-comparison";

type DataRecord = Record<string, unknown>;
type SchemaProperty = Record<string, unknown>;

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
    this.config = {
      maxSamples: 100,
      maxUniqueValues: 100,
      enumThreshold: 50,
      enumMode: "count",
      maxDepth: 3,
      ...config,
    };

    this.state = initialState ?? {
      version: 0,
      fieldStats: {},
      recordCount: 0,
      batchCount: 0,
      lastUpdated: new Date(),
      dataSamples: [],
      maxSamples: this.config.maxSamples,
      detectedIdFields: [],
      detectedGeoFields: { confidence: 0 },
      typeConflicts: [],
    };
  }

  processBatch(records: DataRecord[]): {
    schemaChanged: boolean;
    changes: SchemaChange[];
  } {
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

    // Detect patterns
    this.state.detectedIdFields = detectIdFields(this.state);
    this.state.detectedGeoFields = detectGeoFields(this.state);
    detectEnums(this.state, this.config);

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

    if (!conflict) {
      conflict = {
        path: fieldPath,
        types: {},
        samples: [],
      };

      // Add all existing non-null types
      for (const [type, count] of Object.entries(stats.typeDistribution)) {
        if (type !== "null" && type !== "undefined" && count > 0) {
          conflict.types[type] = count;
        }
      }

      // Add the new conflicting type with count 1
      conflict.types[newType] = 1;
      this.state.typeConflicts.push(conflict);
    } else {
      // Update existing conflict - increment count for the new type
      conflict.types[newType] = (conflict.types[newType] ?? 0) + 1;
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

    for (const [key, value] of Object.entries(obj || {})) {
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

  async getSchema(): Promise<Record<string, unknown>> {
    if (this.state.dataSamples.length === 0) {
      return {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      };
    }

    try {
      // Use quicktype to generate schema from samples
      const jsonInput = jsonInputForTargetLanguage("schema");

      await jsonInput.addSource({
        name: "DataSample",
        samples: this.state.dataSamples.map((s) => JSON.stringify(s)),
      });

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
      let schema: Record<string, unknown>;

      try {
        schema = JSON.parse(schemaString);
      } catch (parseError) {
        logger.error("Failed to parse quicktype output", { schemaString, parseError });
        return this.buildManualSchema();
      }

      // Quicktype might wrap the schema in a definitions structure
      // Check if we have a $ref at the top level
      if (schema.$ref && schema.definitions) {
        // Extract the referenced schema from definitions
        const refName = (schema.$ref as string).replace("#/definitions/", "");
        const definitions = schema.definitions as Record<string, unknown>;
        if (definitions[refName]) {
          schema = definitions[refName] as Record<string, unknown>;
        }
      }

      // Ensure schema has the required top-level structure
      if (!schema.type) {
        schema.type = "object";
      }
      if (!schema.properties) {
        schema.properties = {};
      }
      if (!schema.required) {
        schema.required = [];
      }

      // Enhance with our field statistics
      this.enhanceSchemaWithStats(schema);

      return schema;
    } catch (error) {
      logger.error("Failed to generate schema", { error });
      return this.buildManualSchema();
    }
  }

  private enhanceSchemaWithStats(schema: Record<string, unknown>): void {
    const properties = schema.properties as Record<string, SchemaProperty>;

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

    // Add detected patterns as metadata
    if (this.state.detectedIdFields.length > 0) {
      schema["x-id-fields"] = this.state.detectedIdFields;
    }

    if (this.state.detectedGeoFields.latitude) {
      schema["x-geo-fields"] = this.state.detectedGeoFields;
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

    const items = (field as { items: unknown }).items;
    if (typeof items === "object" && items !== null && "properties" in items) {
      return (items as { properties: unknown }).properties;
    }
    return items;
  }

  private processObjectPart(current: unknown, part: string): unknown {
    if (typeof current === "object" && current !== null && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return null;
  }

  private getNestedProperty(properties: Record<string, SchemaProperty>, path: string): SchemaProperty | null {
    const parts = path.split(".");
    let current: unknown = properties;

    for (const part of parts) {
      if (part.endsWith("[]")) {
        const fieldName = part.slice(0, -2);
        current = this.processArrayPart(current, fieldName);
      } else {
        current = this.processObjectPart(current, part);
      }

      if (current === null) {
        return null;
      }
    }

    return current as SchemaProperty;
  }

  private createArrayProperty(): Record<string, unknown> {
    return {
      type: "array",
      items: {
        type: "object",
        properties: {},
      },
    };
  }

  private createObjectProperty(): Record<string, unknown> {
    return {
      type: "object",
      properties: {},
    };
  }

  private processFieldPath(
    properties: Record<string, unknown>,
    fieldPath: string,
    stats: FieldStatistics,
    required: string[]
  ): void {
    const parts = fieldPath.split(".").filter((p) => p !== "");
    let current = properties;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;

      if (part.endsWith("[]")) {
        const fieldName = part.slice(0, -2);
        if (!current[fieldName]) {
          current[fieldName] = this.createArrayProperty();
        }
        current = (current[fieldName] as { items: { properties: Record<string, unknown> } }).items.properties;
      } else if (isLast) {
        current[part] = this.buildPropertySchema(stats);
        // Mark as required if appears in most records
        if (stats.occurrences >= this.state.recordCount * 0.9) {
          required.push(part);
        }
      } else {
        if (!current[part]) {
          current[part] = this.createObjectProperty();
        }
        current = (current[part] as { properties: Record<string, unknown> }).properties;
      }
    }
  }

  private buildManualSchema(): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [fieldPath, stats] of Object.entries(this.state.fieldStats)) {
      this.processFieldPath(properties, fieldPath, stats, required);
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  private buildPropertySchema(stats: FieldStatistics): Record<string, unknown> {
    const schema: Record<string, unknown> = {};

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

  compareWithPrevious(previousSchema: Record<string, unknown>): SchemaComparison {
    const currentSchema = this.getSchemaSync();
    return compareSchemas(previousSchema, currentSchema);
  }

  getSchemaSync(): Record<string, unknown> {
    return this.buildManualSchema();
  }

  getState(): SchemaBuilderState {
    return { ...this.state };
  }

  getFieldStatistics(): Record<string, FieldStatistics> {
    return { ...this.state.fieldStats };
  }

  getSummary(): {
    recordCount: number;
    fieldCount: number;
    version: number;
    detectedPatterns: {
      idFields: string[];
      geoFields: {
        latitude?: string;
        longitude?: string;
        confidence: number;
      };
      enumFields: string[];
    };
  } {
    const enumFields = Object.entries(this.state.fieldStats)
      .filter(([_, stats]) => stats.isEnumCandidate)
      .map(([field]) => field);

    return {
      recordCount: this.state.recordCount,
      fieldCount: Object.keys(this.state.fieldStats).length,
      version: this.state.version,
      detectedPatterns: {
        idFields: this.state.detectedIdFields,
        geoFields: this.state.detectedGeoFields,
        enumFields,
      },
    };
  }
}

export { detectEnums, detectGeoFields, detectIdFields } from "./pattern-detection";
export { compareSchemas } from "./schema-comparison";
export type { FieldStatistics, SchemaBuilderState, SchemaChange, SchemaComparison } from "@/lib/types/schema-detection";
