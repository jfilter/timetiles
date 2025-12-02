/**
 * Schema Detectors Payload Collection.
 *
 * Provides database-driven configuration for schema detectors.
 * Admin users can enable/disable detectors and configure their options.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig, Field } from "payload";
/**
 * Creates the schema-detectors collection configuration.
 *
 * @param slug - Collection slug (default: 'schema-detectors')
 * @returns Payload collection configuration
 */
export declare const createSchemaDetectorsCollection: (slug?: string) => CollectionConfig;
/**
 * Creates a field to add to the Datasets collection for detector selection.
 *
 * @param collectionSlug - Schema detectors collection slug
 * @returns Payload field configuration
 */
export declare const createDetectorSelectionField: (collectionSlug?: string) => Field;
//# sourceMappingURL=collection.d.ts.map