/**
 * Orchestrates activation and deactivation of data packages.
 *
 * Activation creates a catalog, dataset, and scheduled ingest from a
 * data package manifest. Deactivation disables the scheduled ingest.
 *
 * @module
 * @category DataPackages
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { translateSchemaMode } from "@/lib/ingest/configure-service";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import { createLogger } from "@/lib/logger";
import type { DataPackageActivation, DataPackageFieldMappings, DataPackageManifest } from "@/lib/types/data-packages";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { User } from "@/payload-types";

const logger = createLogger("data-packages");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build Lexical rich text from a plain string. */
const toRichText = (text: string) => ({
  root: {
    type: "root" as const,
    children: [{ type: "paragraph" as const, version: 1, children: [{ type: "text" as const, text, version: 1 }] }],
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
  },
});

/** Convert manifest field mappings to dataset fieldMappingOverrides. */
const buildFieldMappingOverrides = (mappings: DataPackageFieldMappings): Record<string, string | null | undefined> => {
  const overrides: Record<string, string | null | undefined> = {};
  const keys: Array<keyof DataPackageFieldMappings> = [
    "titlePath",
    "descriptionPath",
    "locationNamePath",
    "timestampPath",
    "locationPath",
    "latitudePath",
    "longitudePath",
  ];
  for (const key of keys) {
    if (mappings[key]) overrides[key] = mappings[key];
  }
  return overrides;
};

/** Build scheduled ingest data from manifest. */
const buildScheduledIngestData = (
  manifest: DataPackageManifest,
  catalogId: number,
  datasetId: number,
  userId: number
) => {
  const advancedOptions: Record<string, unknown> = {};

  if (manifest.source.format === "json" && manifest.source.jsonApi) {
    advancedOptions.responseFormat = "json";
    advancedOptions.jsonApiConfig = manifest.source.jsonApi;
  }

  if (manifest.reviewChecks) {
    advancedOptions.reviewChecks = manifest.reviewChecks;
  }

  return {
    name: manifest.name,
    sourceUrl: manifest.source.url,
    catalog: catalogId,
    dataset: datasetId,
    createdBy: userId,
    enabled: true,
    scheduleType: manifest.schedule.type,
    frequency: manifest.schedule.type === "frequency" ? manifest.schedule.frequency : undefined,
    cronExpression: manifest.schedule.type === "cron" ? manifest.schedule.cronExpression : undefined,
    timezone: manifest.schedule.timezone ?? "UTC",
    schemaMode: manifest.schedule.schemaMode ?? "additive",
    authConfig: manifest.source.auth ?? { type: "none" as const },
    advancedOptions: Object.keys(advancedOptions).length > 0 ? advancedOptions : undefined,
    dataPackageSlug: manifest.slug,
  };
};

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

interface ActivateOptions {
  triggerFirstImport?: boolean;
}

interface ActivateResult {
  catalogId: number;
  datasetId: number;
  scheduledIngestId: number;
}

/** Activate a data package: create catalog, dataset, and scheduled ingest. */
export const activateDataPackage = async (
  payload: Payload,
  manifest: DataPackageManifest,
  user: User,
  options: ActivateOptions = {}
): Promise<ActivateResult> => {
  const { triggerFirstImport = true } = options;

  // Check not already activated
  const existing = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: { dataPackageSlug: { equals: manifest.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.docs.length > 0) {
    throw new Error(`Data package "${manifest.slug}" is already activated`);
  }

  // Find or create catalog (multiple packages can share a catalog)
  const existingCatalog = await payload.find({
    collection: COLLECTION_NAMES.CATALOGS,
    where: { name: { equals: manifest.catalog.name } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const catalog =
    existingCatalog.docs[0] ??
    (await payload.create({
      collection: COLLECTION_NAMES.CATALOGS,
      data: {
        name: manifest.catalog.name,
        description: manifest.catalog.description ? toRichText(manifest.catalog.description) : undefined,
        isPublic: manifest.catalog.isPublic ?? true,
        createdBy: user.id,
      },
      overrideAccess: true,
    }));

  logger.info(
    { catalogId: catalog.id, name: manifest.catalog.name, reused: !!existingCatalog.docs[0] },
    existingCatalog.docs[0] ? "Reusing existing catalog" : "Created catalog for data package"
  );

  // Build dataset config
  const idStrategy = manifest.dataset.idStrategy ?? {
    type: "content-hash" as const,
    duplicateStrategy: "skip" as const,
  };
  const schemaConfig = translateSchemaMode(manifest.schedule.schemaMode ?? "additive");
  const fieldMappingOverrides = buildFieldMappingOverrides(manifest.fieldMappings);

  // Create dataset
  const dataset = await payload.create({
    collection: COLLECTION_NAMES.DATASETS,
    data: {
      name: manifest.dataset.name,
      catalog: catalog.id,
      language: manifest.dataset.language ?? "eng",
      isPublic: manifest.catalog.isPublic ?? true,
      createdBy: user.id,
      idStrategy: {
        type: idStrategy.type,
        externalIdPath: idStrategy.externalIdPath,
        duplicateStrategy: idStrategy.duplicateStrategy ?? "skip",
      },
      schemaConfig,
      fieldMappingOverrides,
      geoFieldDetection: {
        autoDetect: true,
        latitudePath: manifest.fieldMappings.latitudePath,
        longitudePath: manifest.fieldMappings.longitudePath,
      },
      deduplicationConfig: { enabled: true },
    },
    overrideAccess: true,
  });

  logger.info({ datasetId: dataset.id, name: manifest.dataset.name }, "Created dataset for data package");

  // Create scheduled ingest
  const scheduledIngest = await payload.create({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    data: buildScheduledIngestData(manifest, catalog.id, dataset.id, user.id),
    overrideAccess: true,
  });

  logger.info(
    { scheduledIngestId: scheduledIngest.id, slug: manifest.slug },
    "Created scheduled ingest for data package"
  );

  // Trigger first import
  if (triggerFirstImport) {
    try {
      const fullIngest = await payload.findByID({
        collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
        id: scheduledIngest.id,
        overrideAccess: true,
      });
      await triggerScheduledIngest(payload, fullIngest, new Date(), { triggeredBy: "manual" });
      logger.info({ scheduledIngestId: scheduledIngest.id }, "Triggered first import for data package");
    } catch (error) {
      logger.warn({ scheduledIngestId: scheduledIngest.id, error }, "Failed to trigger first import");
    }
  }

  return { catalogId: catalog.id, datasetId: dataset.id, scheduledIngestId: scheduledIngest.id };
};

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

/** Deactivate a data package by disabling its scheduled ingest. */
export const deactivateDataPackage = async (payload: Payload, slug: string, user: User): Promise<void> => {
  const result = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: { dataPackageSlug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const scheduledIngest = result.docs[0];
  if (!scheduledIngest) {
    throw new Error(`Data package "${slug}" is not activated`);
  }

  const ownerId = extractRelationId(scheduledIngest.createdBy);
  if (user.role !== "admin" && ownerId !== user.id) {
    throw new Error("You can only deactivate data packages you activated");
  }

  await payload.update({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    id: scheduledIngest.id,
    data: { enabled: false },
    overrideAccess: true,
  });

  logger.info({ slug, scheduledIngestId: scheduledIngest.id }, "Deactivated data package");
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Get activation status for a list of data package slugs. */
export const getActivationStatus = async (
  payload: Payload,
  slugs: string[]
): Promise<Map<string, DataPackageActivation>> => {
  if (slugs.length === 0) return new Map();

  const result = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: { dataPackageSlug: { in: slugs } },
    limit: slugs.length,
    depth: 0,
    overrideAccess: true,
  });

  const statusMap = new Map<string, DataPackageActivation>();
  for (const doc of result.docs) {
    if (doc.dataPackageSlug) {
      statusMap.set(doc.dataPackageSlug, {
        scheduledIngestId: doc.id,
        catalogId: extractRelationId(doc.catalog) as number,
        datasetId: extractRelationId(doc.dataset) as number,
        enabled: doc.enabled ?? false,
      });
    }
  }

  return statusMap;
};
