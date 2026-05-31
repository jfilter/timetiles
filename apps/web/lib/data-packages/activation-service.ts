/**
 * Orchestrates activation and deactivation of data packages.
 *
 * Activation creates a catalog, dataset, and scheduled ingest from a
 * data package manifest. Deactivation disables the scheduled ingest.
 *
 * @module
 * @category DataPackages
 */
import type { Payload, Where } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import type { DataPackageActivation, DataPackageFieldMappings, DataPackageManifest } from "@/lib/data-packages/types";
import { translateSchemaMode } from "@/lib/ingest/configure-service";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import { createLogger } from "@/lib/logger";
import { compareCodeUnits } from "@/lib/utils/compare";
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

/**
 * Build activation key from slug + parameters for uniqueness.
 *
 * Parameters are sorted by UTF-16 code unit (NOT localeCompare) so the key is
 * byte-for-byte reproducible across machines — it is persisted as
 * `dataPackageSlug` and compared to enforce one activation per slug+params, so
 * a locale-dependent ordering could let a duplicate activation slip past.
 *
 * Exported for testing.
 */
export const buildActivationKey = (slug: string, params: Record<string, string>): string => {
  if (Object.keys(params).length === 0) return slug;
  const sorted = Object.entries(params)
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${slug}:${sorted}`;
};

/**
 * Recover the bare package slug from a stored activation key.
 *
 * Parameterized activations persist `dataPackageSlug` as `slug:k=v,...` (see
 * buildActivationKey), while non-parameterized ones store the bare slug. The
 * bare slug never contains `:`, so splitting on the first `:` is unambiguous.
 */
const bareSlugFromActivationKey = (activationKey: string): string => {
  const colonIndex = activationKey.indexOf(":");
  return colonIndex === -1 ? activationKey : activationKey.slice(0, colonIndex);
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
      (!cat.license && Boolean(meta.license)) ||
      (!cat.sourceUrl && Boolean(meta.sourceUrl)) ||
      (!cat.category && Boolean(meta.category)) ||
      (!cat.region && Boolean(meta.region));
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
            group: t.group,
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
      // Capture the pre-claim status so we can revert if the queue step fails
      // after triggerScheduledIngest's atomic claim has already set lastStatus
      // to "running". Without this, a transient queue failure leaves the freshly
      // activated ingest stuck "running", blocking all future triggers (manual,
      // webhook, scheduler) until the hourly stuck-ingest cleanup heals it.
      const previousStatus = fullIngest.lastStatus ?? null;
      try {
        await triggerScheduledIngest(payload, fullIngest, new Date(), { triggeredBy: "manual" });
        logger.info({ scheduledIngestId: scheduledIngest.id }, "Triggered first import for data package");
      } catch (triggerError) {
        // The atomic claim was rejected (already running) means nothing was
        // claimed here, so there is nothing to revert. Otherwise the claim
        // succeeded but queueing failed, leaving the record stuck "running" —
        // revert so future triggers are not silently blocked. Mirrors the
        // recovery in queueWebhookImport and the manual trigger route.
        if (!(triggerError instanceof Error && triggerError.message.includes("already running"))) {
          await payload.update({
            collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
            id: scheduledIngest.id,
            data: { lastStatus: previousStatus },
            overrideAccess: true,
          });
        }
        throw triggerError;
      }
    } catch (error) {
      logger.warn({ scheduledIngestId: scheduledIngest.id, error }, "Failed to trigger first import");
    }
  }

  return { catalogId: catalog.id, datasetId: dataset.id, scheduledIngestId: scheduledIngest.id };
};

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

/**
 * Deactivate a data package by disabling its scheduled ingest.
 *
 * `slug` is the bare package slug. Parameterized activations are persisted with
 * a composite `dataPackageSlug` (`slug:k=v,...`), so when no explicit
 * `parameters` are supplied we match the bare slug exactly OR by the
 * parameterized prefix `slug:` to find the activation regardless of form.
 */
export const deactivateDataPackage = async (
  payload: Payload,
  slug: string,
  user: User,
  parameters?: Record<string, string>
): Promise<void> => {
  const where: Where =
    parameters && Object.keys(parameters).length > 0
      ? { dataPackageSlug: { equals: buildActivationKey(slug, parameters) } }
      : { or: [{ dataPackageSlug: { equals: slug } }, { dataPackageSlug: { like: `${slug}:%` } }] };

  const result = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where,
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

/**
 * Get activation status for a list of data package slugs, keyed by bare slug.
 *
 * Parameterized activations persist `dataPackageSlug` as a composite
 * `slug:k=v,...` key, so an exact-slug query would miss them. We match both the
 * bare slug exactly and the parameterized prefix `slug:`, then key the returned
 * map by the bare slug (recovered from the stored key) so callers can look up
 * status by `manifest.slug`. When a slug has multiple parameter activations we
 * collapse to a single entry, preferring an enabled one.
 */
export const getActivationStatus = async (
  payload: Payload,
  slugs: string[]
): Promise<Map<string, DataPackageActivation>> => {
  if (slugs.length === 0) return new Map();

  const result = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: {
      or: slugs.flatMap((slug) => [{ dataPackageSlug: { equals: slug } }, { dataPackageSlug: { like: `${slug}:%` } }]),
    },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });

  const statusMap = new Map<string, DataPackageActivation>();
  for (const doc of result.docs) {
    if (!doc.dataPackageSlug) continue;
    const bareSlug = bareSlugFromActivationKey(doc.dataPackageSlug);
    const activation: DataPackageActivation = {
      scheduledIngestId: doc.id,
      catalogId: extractRelationId(doc.catalog) as number,
      datasetId: extractRelationId(doc.dataset) as number,
      enabled: doc.enabled ?? false,
    };
    // Prefer an enabled activation when a slug has multiple parameter sets.
    const current = statusMap.get(bareSlug);
    if (!current || (!current.enabled && activation.enabled)) {
      statusMap.set(bareSlug, activation);
    }
  }

  return statusMap;
};
