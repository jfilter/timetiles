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

import { logger } from "../logger";
import type { FieldStatistics, SchemaBuilderState, SchemaChange, SchemaComparison } from "../types/schema-detection";

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
    this.detectIdFields();
    this.detectGeoFields();
    this.detectEnums();

    // Increment version if schema changed
    const schemaChanged = changes.some((c) => c.type === "new_field" || c.type === "type_change");

    if (schemaChanged) {
      this.state.version++;
    }

    return { schemaChanged, changes };
  }

  private processRecord(obj: unknown, pathPrefix: string, depth: number = 0): SchemaChange[] {
    const changes: SchemaChange[] = [];

    if (depth >= this.config.maxDepth) return changes;

    for (const [key, value] of Object.entries(obj || {})) {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Initialize field stats if new
      if (!this.state.fieldStats[path]) {
        this.state.fieldStats[path] = this.createFieldStats(path, depth);
        changes.push({
          type: "new_field",
          path,
          details: { firstValue: value },
          severity: "info",
          autoApprovable: true,
        });
      }

      const stats = this.state.fieldStats[path];
      stats.occurrences++;
      stats.lastSeen = new Date();

      // Process value
      if (value === null || value === undefined) {
        stats.nullCount++;
      } else {
        const valueType = this.getValueType(value);

        // Track type distribution
        stats.typeDistribution[valueType] = (stats.typeDistribution[valueType] ?? 0) + 1;

        // Check for type conflicts
        if (Object.keys(stats.typeDistribution).length > 1) {
          const conflict = this.state.typeConflicts.find((c) => c.path === path);
          if (!conflict) {
            this.state.typeConflicts.push({
              path,
              types: { ...stats.typeDistribution },
              samples: [{ type: valueType, value }],
            });

            changes.push({
              type: "type_change",
              path,
              details: {
                types: Object.keys(stats.typeDistribution),
                distribution: stats.typeDistribution,
              },
              severity: "warning",
              autoApprovable: false,
            });
          }
        }

        // Type-specific processing
        this.processValueType(value, valueType, stats);

        // Recurse for objects
        if (valueType === "object") {
          const subChanges = this.processRecord(value, path, depth + 1);
          changes.push(...subChanges);
        }
      }
    }

    return changes;
  }

  private processValueType(value: unknown, type: string, stats: FieldStatistics): void {
    switch (type) {
      case "string":
        this.processString(value as string, stats);
        break;
      case "number":
        this.processNumber(value as number, stats);
        break;
      case "array":
        this.processArray(value as unknown[], stats);
        break;
    }

    // Track unique values for enum detection
    if (
      (type === "string" || type === "number" || type === "boolean") &&
      stats.uniqueSamples.length < this.config.maxUniqueValues &&
      !stats.uniqueSamples.includes(value)
    ) {
      stats.uniqueSamples.push(value);
    }

    stats.uniqueValues = stats.uniqueSamples.length;
  }

  private processString(value: string, stats: FieldStatistics): void {
    // Detect formats
    if (this.isEmail(value)) {
      stats.formats.email = (stats.formats.email ?? 0) + 1;
    }
    if (this.isUrl(value)) {
      stats.formats.url = (stats.formats.url ?? 0) + 1;
    }
    if (this.isDateTime(value)) {
      stats.formats.dateTime = (stats.formats.dateTime ?? 0) + 1;
    }
    if (this.isNumericString(value)) {
      stats.formats.numeric = (stats.formats.numeric ?? 0) + 1;
    }
  }

  private processNumber(value: number, stats: FieldStatistics): void {
    if (!stats.numericStats) {
      stats.numericStats = {
        min: value,
        max: value,
        avg: value,
        isInteger: Number.isInteger(value),
      };
    } else {
      stats.numericStats.min = Math.min(stats.numericStats.min, value);
      stats.numericStats.max = Math.max(stats.numericStats.max, value);
      stats.numericStats.avg = (stats.numericStats.avg * (stats.occurrences - 1) + value) / stats.occurrences;
      stats.numericStats.isInteger = stats.numericStats.isInteger && Number.isInteger(value);
    }
  }

  private processArray(value: unknown[], stats: FieldStatistics): void {
    // Track array items for nested schema detection
    // In a full implementation, we'd analyze array item types
  }

  private detectGeoFields(): void {
    const latPatterns = /^(lat|latitude|y|coord.*lat|location.*lat)/i;
    const lngPatterns = /^(lng|lon|longitude|x|coord.*lon|location.*lon)/i;

    let latField: string | undefined;
    let lngField: string | undefined;
    let confidence = 0;

    for (const [path, stats] of Object.entries(this.state.fieldStats)) {
      const fieldName = path.split(".").pop() ?? "";

      // Check numeric fields only
      if ((stats.typeDistribution.number ?? 0) > stats.occurrences * 0.9) {
        const isLat = latPatterns.test(fieldName);
        const isLng = lngPatterns.test(fieldName);

        if (isLat && stats.numericStats) {
          const validRange = stats.numericStats.min >= -90 && stats.numericStats.max <= 90;
          if (validRange) {
            latField = path;
            confidence += 0.5;
            stats.geoHints = {
              isLatitude: true,
              isLongitude: false,
              fieldNamePattern: fieldName,
              valueRange: true,
            };
          }
        }

        if (isLng && stats.numericStats) {
          const validRange = stats.numericStats.min >= -180 && stats.numericStats.max <= 180;
          if (validRange) {
            lngField = path;
            confidence += 0.5;
            stats.geoHints = {
              isLatitude: false,
              isLongitude: true,
              fieldNamePattern: fieldName,
              valueRange: true,
            };
          }
        }
      }
    }

    if (latField && lngField) {
      this.state.detectedGeoFields = {
        latitude: latField,
        longitude: lngField,
        confidence,
      };
    }
  }

  private detectIdFields(): void {
    const idPatterns = /^(id|uuid|guid|_id|identifier|key)$/i;
    const detectedIds: string[] = [];

    for (const [path, stats] of Object.entries(this.state.fieldStats)) {
      const fieldName = path.split(".").pop() ?? "";

      // Check if field name matches ID patterns
      if (
        idPatterns.test(fieldName) &&
        stats.occurrences > this.state.recordCount * 0.9 &&
        stats.uniqueValues === stats.occurrences
      ) {
        detectedIds.push(path);
      }
    }

    this.state.detectedIdFields = detectedIds;
  }

  private detectEnums(): void {
    for (const stats of Object.values(this.state.fieldStats)) {
      const uniqueRatio = stats.uniqueValues / stats.occurrences;

      if (this.config.enumMode === "count") {
        stats.isEnumCandidate = stats.uniqueValues <= this.config.enumThreshold;
      } else {
        stats.isEnumCandidate = uniqueRatio <= this.config.enumThreshold / 100;
      }

      if (stats.isEnumCandidate && stats.uniqueSamples.length > 0) {
        // In real implementation, we'd track this during processing
        stats.enumValues = stats.uniqueSamples.map((value) => ({
          value,
          count: 1, // Placeholder
          percent: (1 / stats.occurrences) * 100,
        }));
      }
    }
  }

  async generateSchema(): Promise<SchemaProperty | null> {
    if (this.state.dataSamples.length === 0) {
      return null;
    }

    try {
      const jsonInput = jsonInputForTargetLanguage("schema");

      await jsonInput.addSource({
        name: "EventData",
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
        combineClasses: true,
        rendererOptions: {
          "schema-version": "draft-07",
        },
      });

      const schema = JSON.parse(result.lines.join("\n"));

      // Enhance with our field statistics
      this.enhanceSchemaWithStats(schema);

      return schema;
    } catch (error) {
      logger.error("Schema generation failed", { error });
      throw error;
    }
  }

  private enhanceSchemaWithStats(schema: Record<string, unknown>): void {
    // Handle both direct format and quicktype format
    let properties;
    const schemaWithDefs = schema as {
      definitions?: { EventData?: { properties?: Record<string, unknown> } };
      properties?: Record<string, unknown>;
    };
    if (schemaWithDefs.definitions?.EventData?.properties) {
      properties = schemaWithDefs.definitions.EventData.properties;
    } else {
      properties = schemaWithDefs.properties;
    }

    if (!properties) return;

    for (const [path, stats] of Object.entries(this.state.fieldStats)) {
      const schemaProp = this.getSchemaProperty(schema, path);
      if (!schemaProp) continue;

      const prop = schemaProp as Record<string, unknown>;
      // Add format hints
      if (stats.formats.email && stats.formats.email > stats.occurrences * 0.9) {
        prop.format = "email";
      } else if (stats.formats.url && stats.formats.url > stats.occurrences * 0.9) {
        prop.format = "uri";
      } else if (stats.formats.dateTime && stats.formats.dateTime > stats.occurrences * 0.9) {
        prop.format = "date-time";
      }

      // Add enum values
      if (stats.isEnumCandidate && stats.enumValues) {
        prop.enum = stats.enumValues.map((e) => e.value);
      }

      // Add numeric constraints
      if (stats.numericStats) {
        prop.minimum = stats.numericStats.min;
        prop.maximum = stats.numericStats.max;
        if (stats.numericStats.isInteger) {
          prop.type = "integer";
        }
      }

      // Add custom metadata
      prop["x-field-metadata"] = {
        occurrencePercent: (stats.occurrences / this.state.recordCount) * 100,
        nullable: stats.nullCount > 0,
        geoHint: stats.geoHints,
      };
    }
  }

  getEnumCount(): number {
    return Object.values(this.state.fieldStats).filter((stats) => stats.isEnumCandidate).length;
  }

  getGeoFieldCount(): number {
    return this.state.detectedGeoFields?.latitude ? 1 : 0;
  }

  getState(): SchemaBuilderState {
    return this.state;
  }

  async getSchema(): Promise<unknown> {
    return this.generateSchema();
  }

  async compareWithPrevious(previousSchema: unknown): Promise<SchemaComparison> {
    const currentSchema = await this.generateSchema();
    const changes: SchemaChange[] = [];

    // Helper to extract properties from schema (handles both direct and quicktype formats)
    const getSchemaProperties = (schema: unknown): Record<string, unknown> => {
      const schemaObj = schema as {
        definitions?: { EventData?: { properties?: Record<string, unknown> } };
        properties?: Record<string, unknown>;
      };
      // Quicktype format: schema.definitions.EventData.properties
      if (schemaObj.definitions?.EventData?.properties) {
        return schemaObj.definitions.EventData.properties;
      }
      // Direct format: schema.properties
      return schemaObj.properties || {};
    };

    // Compare schemas
    const prevProperties = getSchemaProperties(previousSchema);
    const currProperties = getSchemaProperties(currentSchema);
    const prevProps = new Set(Object.keys(prevProperties));
    const currProps = new Set(Object.keys(currProperties));

    // New fields
    for (const prop of currProps) {
      if (!prevProps.has(prop)) {
        changes.push({
          type: "new_field",
          path: prop,
          details: { field: currProperties[prop] },
          severity: "info",
          autoApprovable: true,
        });
      }
    }

    // Removed fields
    for (const prop of prevProps) {
      if (!currProps.has(prop)) {
        changes.push({
          type: "removed_field",
          path: prop,
          details: { field: prevProperties[prop] },
          severity: "warning",
          autoApprovable: false,
        });
      }
    }

    // Type changes
    for (const prop of currProps) {
      if (prevProps.has(prop)) {
        const prevType = (prevProperties[prop] as Record<string, unknown>)?.type;
        const currType = (currProperties[prop] as Record<string, unknown>)?.type;

        if (prevType !== currType) {
          changes.push({
            type: "type_change",
            path: prop,
            details: { oldType: prevType, newType: currType },
            severity: "error",
            autoApprovable: false,
          });
        }

        // Enum changes
        const prevEnum = (prevProperties[prop] as Record<string, unknown>)?.enum as unknown[] | undefined;
        const currEnum = (currProperties[prop] as Record<string, unknown>)?.enum as unknown[] | undefined;

        if (prevEnum && currEnum) {
          const added = currEnum.filter((v: unknown) => !prevEnum.includes(v));
          const removed = prevEnum.filter((v: unknown) => !currEnum.includes(v));

          if (added.length > 0 || removed.length > 0) {
            changes.push({
              type: "enum_change",
              path: prop,
              details: { added, removed },
              severity: removed.length > 0 ? "warning" : "info",
              autoApprovable: removed.length === 0, // Only auto-approve if adding values
            });
          }
        }
      }
    }

    const isBreaking = changes.some((c) => c.severity === "error");
    const requiresApproval = changes.some((c) => !c.autoApprovable);
    const canAutoApprove = !requiresApproval && changes.length > 0;

    return {
      changes,
      isBreaking,
      requiresApproval,
      canAutoApprove,
    };
  }

  // Utility methods
  private createFieldStats(path: string, depth: number): FieldStatistics {
    return {
      path,
      occurrences: 0,
      occurrencePercent: 0,
      nullCount: 0,
      uniqueValues: 0,
      uniqueSamples: [],
      typeDistribution: {},
      formats: {},
      isEnumCandidate: false,
      firstSeen: new Date(),
      lastSeen: new Date(),
      depth,
    };
  }

  private getValueType(value: unknown): string {
    if (Array.isArray(value)) return "array";
    if (value instanceof Date) return "date";
    if (value === null) return "null";
    return typeof value;
  }

  private updateSamples(records: unknown[]): void {
    // Add new samples, maintaining max size
    for (const record of records) {
      if (this.state.dataSamples.length >= this.config.maxSamples) {
        // Remove oldest
        this.state.dataSamples.shift();
      }
      this.state.dataSamples.push(record);
    }
  }

  // Format detection helpers
  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(value);
  }

  private isUrl(value: string): boolean {
    return /^https?:\/\//.test(value);
  }

  private isDateTime(value: string): boolean {
    return !isNaN(Date.parse(value)) && /\d{4}-\d{2}-\d{2}/.test(value);
  }

  private isNumericString(value: string): boolean {
    // This regex is safe - it has no backtracking issues
    // eslint-disable-next-line security/detect-unsafe-regex
    return /^\d+(\.\d+)?$/.test(value);
  }

  private getSchemaProperty(schema: unknown, path: string): unknown {
    const parts = path.split(".");

    // Handle quicktype format vs direct format
    let properties;
    const schemaObj = schema as {
      definitions?: { EventData?: { properties?: Record<string, unknown> } };
      properties?: Record<string, unknown>;
    };
    if (schemaObj.definitions?.EventData?.properties) {
      properties = schemaObj.definitions.EventData.properties;
    } else {
      properties = schemaObj.properties;
    }

    if (!properties) return null;

    let current = properties;

    for (const part of parts) {
      if (!current?.[part]) return null;
      if (parts[parts.length - 1] === part) {
        return current[part];
      }
      current = (current[part] as Record<string, unknown>).properties as Record<string, unknown>;
    }

    return null;
  }
}
