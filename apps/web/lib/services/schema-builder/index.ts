/**
 * Barrel re-exports for the schema-builder service.
 *
 * @module
 * @category Services
 */
export { DEFAULT_ENUM_CONFIG, ProgressiveSchemaBuilder } from "./schema-builder";
export type { SchemaProperty } from "./schema-comparison";
export { compareSchemas } from "./schema-comparison";
export type { FieldStatistics, SchemaBuilderState, SchemaChange, SchemaComparison } from "@/lib/types/schema-detection";
