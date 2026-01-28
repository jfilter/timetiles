/**
 * Schema Detection Payload Plugin.
 *
 * A Payload CMS plugin that provides language-aware schema detection
 * for import workflows. Follows the Payload plugin pattern:
 * (options) => (config) => modifiedConfig
 *
 * @module
 * @category Plugins
 */

import type { CollectionConfig, Config } from "payload";

import { createDetectorSelectionField, createSchemaDetectorsCollection } from "./collection";
import { defaultDetector } from "./detectors/default-detector";
import { SchemaDetectionService } from "./service";
import type { SchemaDetectionPluginOptions, SchemaDetector } from "./types";

/**
 * Chain onInit handlers without losing existing handler.
 */
const chainOnInit = (existingOnInit: Config["onInit"], newOnInit: NonNullable<Config["onInit"]>): Config["onInit"] => {
  return async (payload) => {
    if (existingOnInit) {
      await existingOnInit(payload);
    }
    await newOnInit(payload);
  };
};

/**
 * Seed default detector configurations into the database.
 */
const seedDefaultDetectors = async (
  payload: { create: Function; find: Function },
  collectionSlug: string,
  detectors: SchemaDetector[]
): Promise<void> => {
  try {
    // Check what already exists
    const existing = await payload.find({
      collection: collectionSlug,
      limit: 100,
    });

    const existingNames = new Set(existing.docs.map((d: { name: string }) => d.name));

    // Seed any detectors that don't exist
    for (const detector of detectors) {
      if (!existingNames.has(detector.name)) {
        await payload.create({
          collection: collectionSlug,
          data: {
            name: detector.name,
            label: detector.label,
            description: detector.description ?? "",
            enabled: true,
            priority: detector.name === "default" ? 1000 : 100,
          },
        });
      }
    }
  } catch (error) {
    // Don't fail startup if seeding fails
    console.warn("[schema-detection] Failed to seed default detectors:", error);
  }
};

/**
 * Extend the Datasets collection with a detector selection field.
 */
const extendDatasetsCollection = (collection: CollectionConfig, collectionSlug: string): CollectionConfig => {
  return {
    ...collection,
    fields: [...collection.fields, createDetectorSelectionField(collectionSlug)],
  };
};

/**
 * Schema Detection Plugin for Payload CMS.
 *
 * Adds schema detection capabilities to your Payload application:
 * - A schema-detectors collection for database-driven configuration
 * - A detector selection field on the Datasets collection
 * - A SchemaDetectionService accessible via config.custom.schemaDetection
 *
 * @example
 * ```typescript
 * import { schemaDetectionPlugin, defaultDetector } from '@timetiles/payload-schema-detection';
 *
 * export default buildConfig({
 *   plugins: [
 *     schemaDetectionPlugin({
 *       detectors: [myCustomDetector, defaultDetector],
 *       extendDatasets: true,
 *     }),
 *   ],
 * });
 *
 * // Later, access the service:
 * const service = payload.config.custom.schemaDetection.service;
 * const result = await service.detect('my-detector', context);
 * ```
 */
export const schemaDetectionPlugin = (options: SchemaDetectionPluginOptions = {}) => {
  const {
    enabled = true,
    detectors = [defaultDetector],
    collectionSlug = "schema-detectors",
    extendDatasets = true,
    datasetsCollectionSlug = "datasets",
  } = options;

  return (incomingConfig: Config): Config => {
    // If disabled, return config unchanged
    if (!enabled) {
      return incomingConfig;
    }

    // Create the detection service with all detectors
    const service = new SchemaDetectionService(detectors);

    // Start building the modified config
    const config: Config = { ...incomingConfig };

    // Add the schema-detectors collection
    config.collections = [...(config.collections ?? []), createSchemaDetectorsCollection(collectionSlug)];

    // Optionally extend the Datasets collection
    if (extendDatasets) {
      config.collections = config.collections.map((collection) => {
        if (collection.slug === datasetsCollectionSlug) {
          return extendDatasetsCollection(collection, collectionSlug);
        }
        return collection;
      });
    }

    // Expose the service via config.custom
    config.custom = {
      ...config.custom,
      schemaDetection: {
        service,
        detectors,
      },
    };

    // Chain onInit to seed default detector configs
    config.onInit = chainOnInit(config.onInit, async (payload) => {
      await seedDefaultDetectors(payload, collectionSlug, detectors);
      console.log(`[schema-detection] Plugin initialized with ${detectors.length} detector(s)`);
    });

    return config;
  };
};
