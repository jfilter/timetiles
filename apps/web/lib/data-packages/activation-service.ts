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
import type { DataPackageActivation, DataPackageManifest, DataPackageTransform } from "@/lib/data-packages/types";
import { isUniqueViolation } from "@/lib/database/unique-violation";
import { translateSchemaMode } from "@/lib/ingest/configure-service";
import { buildPlanFromPaths } from "@/lib/ingest/plan-builder";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import { createLogger } from "@/lib/logger";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";
import { createQuotaService } from "@/lib/services/quota-service";
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

/** Convert a manifest transform spec to a typed {@link IngestTransform}. */
const manifestTransformToIngest = (t: DataPackageTransform): IngestTransform =>
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
  }) as unknown as IngestTransform;

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

  // Data-package imports run unattended, so default the ambiguous
  // coordinate-order and date-order gates to skipped (an ambiguous column yields
  // no points / falls back to the per-row date heuristic rather than stalling the
  // activation). A manifest's explicit reviewChecks win; declaring the true order
  // in the interpretation plan keeps the format explicit so the gate never fires.
  advancedOptions.reviewChecks = {
    skipAmbiguousCoordinateCheck: true,
    skipAmbiguousDateCheck: true,
    ...manifest.reviewChecks,
  };

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
  /**
   * The originating request, carrying the acting `user`. When present (an
   * interactive user activation), it is threaded into the scheduled-ingest
   * create so the maxActiveSchedules quota hook fires. Omitted for the
   * server-side auto-activator, which runs as a trusted system actor.
   */
  req?: AuthenticatedRequest;
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
  user: User,
  req: ActivateOptions["req"]
): Promise<{ catalog: Catalog; reused: boolean }> => {
  // Scope the reuse lookup to the activating user's OWN catalogs. A bare
  // name-only match under overrideAccess is an IDOR: a package named like a
  // victim's private catalog would reuse it — enriching its metadata and
  // writing a new dataset into it. Ownership scoping means a same-named foreign
  // catalog is never touched; we create a fresh one owned by this user instead.
  const existing = await payload.find({
    collection: COLLECTION_NAMES.CATALOGS,
    where: { and: [{ name: { equals: resolved.catalog.name } }, { createdBy: { equals: user.id } }] },
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
        req,
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
    req,
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

  // Build the AUTHORED interpretation plan from manifest mappings + transforms.
  // Data packages run unattended → "best-effort"; a manifest can pin the
  // coordinate/date order so the ambiguous-order gate never fires.
  const fm = resolved.fieldMappings;
  const transforms = resolved.transforms?.map(manifestTransformToIngest);
  const interpretationPlan = buildPlanFromPaths(
    {
      titlePath: fm.titlePath,
      descriptionPath: fm.descriptionPath,
      locationNamePath: fm.locationNamePath,
      timestampPath: fm.timestampPath,
      endTimestampPath: fm.endTimestampPath,
      locationPath: fm.locationPath,
      latitudePath: fm.latitudePath,
      longitudePath: fm.longitudePath,
      coordinatePath: fm.coordinatePath,
      coordinateFormat: fm.coordinateFormat,
      timestampOrder: fm.timestampOrder,
      endTimestampOrder: fm.endTimestampOrder,
    },
    transforms,
    "best-effort"
  ) as unknown as Record<string, unknown>;

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
      interpretationPlan,
      geoFieldDetection: {
        autoDetect: true,
        latitudePath: resolved.fieldMappings.latitudePath,
        longitudePath: resolved.fieldMappings.longitudePath,
      },
      deduplicationConfig: { enabled: true },
    },
    overrideAccess: true,
  });
};

/** Best-effort delete of a dataset orphaned by a lost activation race. */
const deleteOrphanDataset = async (payload: Payload, datasetId: number): Promise<void> => {
  try {
    await payload.delete({ collection: COLLECTION_NAMES.DATASETS, id: datasetId, overrideAccess: true });
    logger.info({ datasetId }, "Rolled back orphan dataset after lost activation race");
  } catch (cleanupError) {
    logger.warn({ datasetId, cleanupError }, "Failed to roll back orphan dataset after lost activation race");
  }
};

/**
 * Create the activation's scheduled ingest. On ANY failure, roll back the orphan
 * dataset this activation already created (nothing references it yet); on a
 * lost-race unique violation, additionally surface the same "already activated"
 * signal the optimistic existence check raises.
 */
const createActivationScheduledIngest = async (
  payload: Payload,
  ingestData: ReturnType<typeof buildScheduledIngestData>,
  activationKey: string,
  orphanDatasetId: number,
  req?: AuthenticatedRequest
) => {
  try {
    return await payload.create({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      data: { ...ingestData, _status: "published" },
      overrideAccess: true,
      // Threading `req` (with the acting user) makes the maxActiveSchedules quota
      // hook increment usage for this owner. Without it the hook skips on
      // `!req.user` and the quota is silently bypassed.
      req,
    });
  } catch (error) {
    // Roll the orphan dataset back on EVERY failure, not just the lost race. Any
    // other error (an invalid cron or URL in the manifest, a DB blip) used to leave
    // the dataset behind, and the retry then hit the (catalog, name) unique index
    // and reported "already activated" for a package that has no schedule at all.
    await deleteOrphanDataset(payload, orphanDatasetId);

    if (isUniqueViolation(error)) {
      throw new Error(`Data package "${activationKey}" is already activated`);
    }
    throw error;
  }
};

/**
 * Handle a data package that already has an activation row.
 *
 * Deactivation only flips `enabled` and keeps the row, so without this the package was stuck
 * showing "Activated" forever with no way back on — no other code path re-enables it.
 * Re-enabling is owner-only (the rule deactivateDataPackage enforces) and consumes an
 * ACTIVE_SCHEDULES slot exactly like a fresh activation, so it passes the same quota gate.
 */
const reactivateOrReject = async (
  payload: Payload,
  existingDoc: { id: number; enabled?: boolean | null; createdBy?: unknown; catalog?: unknown; dataset?: unknown },
  user: User,
  activationKey: string,
  req: ActivateOptions["req"]
): Promise<ActivateResult> => {
  const ownsExisting = user.role === "admin" || extractRelationId(existingDoc.createdBy) === user.id;

  if (existingDoc.enabled !== false || !ownsExisting) {
    throw new Error(`Data package "${activationKey}" is already activated`);
  }

  if (req?.user) {
    await createQuotaService(payload).validateQuota(req.user, "ACTIVE_SCHEDULES", 1);
  }

  await payload.update({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    id: existingDoc.id,
    data: { enabled: true },
    overrideAccess: true,
    // Pass the acting request so the collection's quota hooks see the real user.
    ...(req ? { req } : {}),
  });

  logger.info({ activationKey, scheduledIngestId: existingDoc.id }, "Re-activated data package");

  return {
    scheduledIngestId: existingDoc.id,
    catalogId: extractRelationId(existingDoc.catalog) as number,
    datasetId: extractRelationId(existingDoc.dataset) as number,
  };
};

/** Activate a data package: create catalog, dataset, and scheduled ingest. */
export const activateDataPackage = async (
  payload: Payload,
  manifest: DataPackageManifest,
  user: User,
  options: ActivateOptions = {}
): Promise<ActivateResult> => {
  const { triggerFirstImport = true, parameters = {}, req } = options;

  // Resolve template parameters if the manifest defines any
  const resolved = manifest.parameters?.length ? resolveManifestParameters(manifest, parameters) : manifest;
  const activationKey = buildActivationKey(manifest.slug, parameters);

  // Deliberately GLOBAL, matching the unique index on dataPackageSlug: an activation is one
  // per key for the whole instance, not per user. Scoping this by owner would let a second
  // user past the check and straight into a raw unique-violation from Postgres.
  const existing = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: { dataPackageSlug: { equals: activationKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const existingDoc = existing.docs[0];
  if (existingDoc) {
    return reactivateOrReject(payload, existingDoc, user, activationKey, options.req);
  }

  // For interactive user activations (req present) enforce the active-schedules
  // quota up front, before any catalog/dataset writes, so a quota-exceeded user
  // gets a clean error and no partial state. The auto-activator (no req) is a
  // trusted system actor and is intentionally not quota-limited. Mirrors
  // createScheduledIngest in configure-service.
  if (req?.user) {
    await createQuotaService(payload).validateQuota(req.user, "ACTIVE_SCHEDULES", 1);
  }

  const { catalog, reused } = await findOrCreateCatalog(payload, resolved, user, req);

  logger.info(
    { catalogId: catalog.id, name: resolved.catalog.name, reused },
    reused ? "Reusing existing catalog" : "Created catalog for data package"
  );

  // Create dataset. A concurrent activation reusing the same catalog can lose
  // the datasets_catalog_name_unique race here; translate it to the same
  // "already activated" signal (nothing to roll back — our create is what failed).
  let dataset: Dataset;
  try {
    dataset = await createDatasetFromManifest(payload, resolved, catalog.id, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Data package "${activationKey}" is already activated`);
    }
    throw error;
  }

  logger.info({ datasetId: dataset.id, name: resolved.dataset.name }, "Created dataset for data package");

  // Create scheduled ingest (use resolved manifest for URL/name, activationKey for tracking).
  // The data_package_slug unique index is the keystone that makes a concurrent
  // activation fail here; createActivationScheduledIngest rolls back our orphan
  // dataset and surfaces "already activated" on that lost race.
  const ingestData = buildScheduledIngestData(resolved, catalog.id, dataset.id, user.id);
  ingestData.dataPackageSlug = activationKey;
  const scheduledIngest = await createActivationScheduledIngest(payload, ingestData, activationKey, dataset.id, req);

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
    depth: 0,
    // The contains-match can return many foreign rows — without this the true
    // match may sit past the default 10-doc page and never reach the filter.
    pagination: false,
    overrideAccess: true,
  });

  // Payload's `like` is a contains match (unescaped ILIKE %value%), so the
  // prefix query can also return foreign activations whose key merely contains
  // "<slug>:" (e.g. "city-demo:..." matches slug "demo"). Filter exactly in JS
  // before acting — otherwise deactivation can disable the wrong package.
  //
  // ALL exact matches, not just the first: a parameterized package can hold N
  // activations under different parameter sets, and the deactivate route never
  // forwards `parameters`. Acting on a single arbitrary document left the rest
  // live with no way to reach them through the UI.
  const matches = result.docs.filter(
    (doc) => doc.dataPackageSlug === slug || doc.dataPackageSlug?.startsWith(`${slug}:`) === true
  );
  if (matches.length === 0) {
    throw new Error(`Data package "${slug}" is not activated`);
  }

  // Ownership is enforced per document. A non-admin who owns none of the
  // matches gets the same 403 as before; partial ownership deactivates only
  // their own activations.
  const owned = matches.filter((doc) => user.role === "admin" || extractRelationId(doc.createdBy) === user.id);
  if (owned.length === 0) {
    throw new Error("You can only deactivate data packages you activated");
  }

  for (const scheduledIngest of owned) {
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: { enabled: false },
      overrideAccess: true,
    });
  }

  logger.info(
    { slug, scheduledIngestIds: owned.map((doc) => doc.id), skipped: matches.length - owned.length },
    "Deactivated data package"
  );
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
  slugs: string[],
  /** The requesting user. Internal ids are returned only for activations they own. */
  userId?: number
): Promise<Map<string, DataPackageActivation>> => {
  if (slugs.length === 0) return new Map();

  // The query stays GLOBAL: dataPackageSlug is uniquely indexed instance-wide, so "is this
  // package activated" is an instance-wide fact and filtering by owner would tell a second
  // user "not activated" for something they cannot activate.
  //
  // What was actually leaking is the DETAIL. Running with overrideAccess handed every user
  // the owner's scheduledIngestId/catalogId/datasetId and a Deactivate button that 403s, so
  // those are now returned only to the owner (see `ownedByCaller` below).
  const result = await payload.find({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    where: {
      or: slugs.flatMap((slug) => [{ dataPackageSlug: { equals: slug } }, { dataPackageSlug: { like: `${slug}:%` } }]),
    },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });

  // `like` is a contains match (see deactivateDataPackage) — drop any doc
  // whose recovered bare slug wasn't actually requested.
  const requestedSlugs = new Set(slugs);

  const statusMap = new Map<string, DataPackageActivation>();
  for (const doc of result.docs) {
    if (!doc.dataPackageSlug) continue;
    const bareSlug = bareSlugFromActivationKey(doc.dataPackageSlug);
    if (!requestedSlugs.has(bareSlug)) continue;
    // Internal ids only for the owner. Everyone else learns that the package is activated —
    // an instance-wide fact they need, since they cannot activate it either — and nothing else.
    const ownedByCaller = userId != null && extractRelationId(doc.createdBy) === userId;
    const activation: DataPackageActivation = {
      enabled: doc.enabled ?? false,
      ownedByCaller,
      ...(ownedByCaller
        ? {
            scheduledIngestId: doc.id,
            catalogId: extractRelationId(doc.catalog),
            datasetId: extractRelationId(doc.dataset),
          }
        : {}),
    };
    // Prefer an enabled activation when a slug has multiple parameter sets.
    const current = statusMap.get(bareSlug);
    if (!current || (!current.enabled && activation.enabled)) {
      statusMap.set(bareSlug, activation);
    }
  }

  return statusMap;
};
