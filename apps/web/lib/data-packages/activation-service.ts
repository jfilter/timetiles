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
import type { Catalog, Dataset, User } from "@/payload-types";

const logger = createLogger("data-packages");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Substitute `{{key}}` placeholders in a string with parameter values. */
const substituteTemplate = (s: string, params: Record<string, string>): string =>
  s.replace(/\{\{(\w+)\}\}/g, (match, key: string) => params[key] ?? match);

/** Recursively substitute `{{param}}` placeholders in all strings within a value. */
const deepSubstitute = (value: unknown, params: Record<string, string>): unknown => {
  if (typeof value === "string") return substituteTemplate(value, params);
  if (Array.isArray(value)) return value.map((v) => deepSubstitute(v, params));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepSubstitute(v, params)]));
  }
  return value;
};

/** Resolve template parameters in a manifest, returning a new manifest with substituted values. */
const resolveManifestParameters = (
  manifest: DataPackageManifest,
  params: Record<string, string>
): DataPackageManifest => {
  for (const p of manifest.parameters ?? []) {
    if (p.required && !params[p.name]) {
      throw new Error(`Missing required parameter: "${p.name}" (${p.label})`);
    }
  }
  return deepSubstitute(manifest, params) as DataPackageManifest;
};

/** Build activation key from slug + parameters for uniqueness. */
const buildActivationKey = (slug: string, params: Record<string, string>): string => {
  if (Object.keys(params).length === 0) return slug;
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${slug}:${sorted}`;
};

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
    "endTimestampPath",
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

  if (manifest.source.format === "html-in-json") {
    advancedOptions.responseFormat = "html-in-json";
    advancedOptions.htmlExtractConfig = manifest.source.htmlExtract;
    if (manifest.source.jsonApi) {
      advancedOptions.jsonApiConfig = manifest.source.jsonApi;
    }
  } else if (manifest.source.format === "json" && manifest.source.jsonApi) {
    advancedOptions.responseFormat = "json";
    advancedOptions.jsonApiConfig = manifest.source.jsonApi;
  }

  // preProcessing is a top-level field on ScheduledIngest, not inside advancedOptions

  if (manifest.reviewChecks) {
    advancedOptions.reviewChecks = manifest.reviewChecks;
  }

  // Merge geocodingBias: use coverage.countries as fallback for countryCodes
  const coverageCountries = manifest.coverage?.countries;
  if (manifest.geocodingBias ?? coverageCountries?.length) {
    advancedOptions.geocodingBias = {
      ...manifest.geocodingBias,
      countryCodes: manifest.geocodingBias?.countryCodes ?? coverageCountries,
    };
  }

  return {
    name: manifest.title,
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
    excludeFields: manifest.source.excludeFields ?? undefined,
    preProcessing: manifest.source.preProcessing ?? undefined,
    dataPackageSlug: manifest.slug,
  };
};

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

interface ActivateOptions {
  triggerFirstImport?: boolean;
  parameters?: Record<string, string>;
}

interface ActivateResult {
  catalogId: number;
  datasetId: number;
  scheduledIngestId: number;
}

/** Find an existing catalog by name or create a new one, enriching metadata on reuse. */
const findOrCreateCatalog = async (
  payload: Payload,
  resolved: DataPackageManifest,
  user: User
): Promise<{ catalog: Catalog; reused: boolean }> => {
  const existing = await payload.find({
    collection: COLLECTION_NAMES.CATALOGS,
    where: { name: { equals: resolved.catalog.name } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const publisher = resolved.catalog.publisher ?? resolved.publisher;
  const meta = {
    license: resolved.catalog.license,
    sourceUrl: resolved.catalog.sourceUrl ?? resolved.url,
    category: resolved.catalog.category,
    region: resolved.catalog.region,
    tags: resolved.catalog.tags?.map((tag) => ({ tag })),
    publisher: publisher ? { name: publisher.name, url: publisher.url } : undefined,
  };

  if (existing.docs[0]) {
    const cat = existing.docs[0];
    const needsUpdate =
      (!cat.license && meta.license) ?? (!cat.sourceUrl && meta.sourceUrl) ?? (!cat.category && meta.category);
    if (needsUpdate) {
      const updated = await payload.update({
        collection: COLLECTION_NAMES.CATALOGS,
        id: cat.id,
        data: {
          license: cat.license ?? meta.license,
          sourceUrl: cat.sourceUrl ?? meta.sourceUrl,
          category: cat.category ?? meta.category,
          region: cat.region ?? meta.region,
        },
        overrideAccess: true,
      });
      return { catalog: updated, reused: true };
    }
    return { catalog: cat, reused: true };
  }

  const created = await payload.create({
    collection: COLLECTION_NAMES.CATALOGS,
    data: {
      name: resolved.catalog.name,
      description: (() => {
        const descText = resolved.catalog.description ?? resolved.summary;
        return descText ? toRichText(descText) : undefined;
      })(),
      isPublic: resolved.catalog.isPublic ?? true,
      createdBy: user.id,
      _status: "published",
      ...meta,
    },
    overrideAccess: true,
  });
  return { catalog: created, reused: false };
};

/** Create a dataset from a resolved data package manifest. */
const createDatasetFromManifest = async (
  payload: Payload,
  resolved: DataPackageManifest,
  catalogId: number,
  userId: number
): Promise<Dataset> => {
  const idStrategy = resolved.dataset.idStrategy ?? {
    type: "content-hash" as const,
    duplicateStrategy: "skip" as const,
  };
  const schemaConfig = translateSchemaMode(resolved.schedule.schemaMode ?? "additive");
  const fieldMappingOverrides = buildFieldMappingOverrides(resolved.fieldMappings);

  return payload.create({
    collection: COLLECTION_NAMES.DATASETS,
    data: {
      _status: "published",
      name: resolved.dataset.name,
      catalog: catalogId,
      language: resolved.dataset.language ?? "eng",
      isPublic: resolved.catalog.isPublic ?? true,
      createdBy: userId,
      license: resolved.dataset.license,
      sourceUrl: resolved.dataset.sourceUrl,
      idStrategy: {
        type: idStrategy.type,
        externalIdPath: idStrategy.externalIdPath,
        duplicateStrategy: (idStrategy.duplicateStrategy ?? "skip") as "skip" | "update",
      },
      schemaConfig,
      fieldMappingOverrides,
      geoFieldDetection: {
        autoDetect: true,
        latitudePath: resolved.fieldMappings.latitudePath,
        longitudePath: resolved.fieldMappings.longitudePath,
      },
      deduplicationConfig: { enabled: true },
      ingestTransforms: resolved.transforms?.map(
        (t) =>
          ({
            id: crypto.randomUUID(),
            type: t.type,
            active: true,
            autoDetected: false,
            from: t.from,
            to: t.to,
            delimiter: t.delimiter,
            toFields: t.toFields,
            inputFormat: t.inputFormat,
            outputFormat: t.outputFormat,
            timezone: t.timezone,
            operation: t.operation,
            pattern: t.pattern,
            replacement: t.replacement,
            expression: t.expression,
            fromFields: t.fromFields,
            separator: t.separator,
          }) as NonNullable<Dataset["ingestTransforms"]>[number]
      ),
    },
    overrideAccess: true,
  });
};

/** Activate a data package: create catalog, dataset, and scheduled ingest. */
export const activateDataPackage = async (
  payload: Payload,
  manifest: DataPackageManifest,
  user: User,
  options: ActivateOptions = {}
): Promise<ActivateResult> => {
  const { triggerFirstImport = true, parameters = {} } = options;

  // Resolve template parameters if the manifest defines any
  const resolved = manifest.parameters?.length ? resolveManifestParameters(manifest, parameters) : manifest;
  const activationKey = buildActivationKey(manifest.slug, parameters);

  // Check not already activated (with these parameters)
  const existing = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: { dataPackageSlug: { equals: activationKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.docs.length > 0) {
    throw new Error(`Data package "${activationKey}" is already activated`);
  }

  const { catalog, reused } = await findOrCreateCatalog(payload, resolved, user);

  logger.info(
    { catalogId: catalog.id, name: resolved.catalog.name, reused },
    reused ? "Reusing existing catalog" : "Created catalog for data package"
  );

  // Create dataset
  const dataset = await createDatasetFromManifest(payload, resolved, catalog.id, user.id);

  logger.info({ datasetId: dataset.id, name: resolved.dataset.name }, "Created dataset for data package");

  // Create scheduled ingest (use resolved manifest for URL/name, activationKey for tracking)
  const ingestData = buildScheduledIngestData(resolved, catalog.id, dataset.id, user.id);
  ingestData.dataPackageSlug = activationKey;
  const scheduledIngest = await payload.create({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    data: { ...ingestData, _status: "published" },
    overrideAccess: true,
  });

  logger.info(
    { scheduledIngestId: scheduledIngest.id, slug: activationKey },
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
