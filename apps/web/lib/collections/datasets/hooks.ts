/**
 * Hooks for the Datasets collection.
 *
 * Validates business rules such as:
 * - Datasets in public catalogs must be public
 * - Force public if allowPrivateImports is disabled
 * - Sync isPublic to events for denormalized access control
 * - Dataset names must be unique within a catalog
 *
 * @module
 * @category Collections
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
  Where,
} from "payload";

import { safeFetchRecord } from "@/lib/collections/catalog-ownership";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { validateExtractPattern } from "@/lib/ingest/safe-regex";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getFeatureFlagService } from "@/lib/services/feature-flag-service";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import type { Catalog, Dataset, User } from "@/payload-types";

/** Check if private imports are allowed */
const validatePrivateImportAllowed = async (req: PayloadRequest, isPublic: boolean | undefined): Promise<void> => {
  if (isPublic === false) {
    const enabled = await getFeatureFlagService(req.payload).isEnabled("allowPrivateImports");
    if (!enabled) {
      throw new Error("Private datasets are currently disabled. Please make the dataset public.");
    }
  }
};

/** Get creator ID from catalog */
const getCatalogCreatorId = (catalog: Catalog): number | null => {
  if (!catalog.createdBy) return null;
  return extractRelationId(catalog.createdBy) ?? null;
};

/** Validate user can create dataset in this catalog */
const validateCreatePermission = (user: User, catalogCreatorId: number | null): void => {
  const isOwner = catalogCreatorId === user.id;

  if (!isPrivileged(user) && !isOwner) {
    throw new Error("You can only create datasets in your own catalogs");
  }
};

/** Validate dataset visibility matches catalog requirements */
const validateDatasetVisibility = (catalog: Catalog, isPublic: boolean | undefined): void => {
  if (catalog.isPublic && isPublic === false) {
    throw new Error("Datasets in public catalogs must be public");
  }
};

interface CatalogFields {
  catalogCreatorId?: number;
  catalogIsPublic: boolean;
}

/** Process catalog validation and extract denormalized fields */
const processCatalogValidation = async (
  req: PayloadRequest,
  catalogRef: number | Catalog,
  isPublic: boolean | undefined,
  operation: "create" | "update",
  originalDoc?: Partial<Dataset>
): Promise<CatalogFields> => {
  const catalogId = requireRelationId(catalogRef, "dataset.catalog");
  const catalog = await safeFetchRecord(req, "catalogs", catalogId);

  if (!catalog) {
    return { catalogIsPublic: false };
  }

  const catalogCreatorId = getCatalogCreatorId(catalog);

  // Validate create permission
  if (operation === "create" && req.user) {
    validateCreatePermission(req.user, catalogCreatorId);
  }

  // Validate update permission when catalog is being changed
  if (operation === "update" && req.user) {
    const previousCatalogId = originalDoc?.catalog ? extractRelationId(originalDoc.catalog) : undefined;
    if (previousCatalogId !== catalogId) {
      validateCreatePermission(req.user, catalogCreatorId);
    }
  }

  // Validate visibility
  validateDatasetVisibility(catalog, isPublic);

  return { catalogCreatorId: catalogCreatorId ?? undefined, catalogIsPublic: catalog.isPublic ?? false };
};

/**
 * Validates that datasets in public catalogs are also public.
 * Also forces datasets to be public if allowPrivateImports is disabled.
 * Sets createdBy and catalogCreatorId on creation/update.
 */
/**
 * Validate user-supplied regex patterns on `extract` ingest transforms before
 * the dataset is saved.
 *
 * Mirrors the runtime guard in `applyExtractTransform` — rejects known
 * catastrophic-backtracking shapes up front so the user sees the error at
 * configuration time rather than having their import stall the worker.
 */
export const validateIngestTransformPatterns: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation !== "create" && operation !== "update") return data;

  const transforms = (data?.ingestTransforms ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(transforms) || transforms.length === 0) return data;

  for (const [index, transform] of transforms.entries()) {
    if (transform?.type !== "extract") continue;

    const pattern = transform.pattern;
    if (pattern == null || pattern === "") {
      // Empty pattern is tolerated at save-time — runtime skips the transform.
      continue;
    }

    if (typeof pattern !== "string") {
      throw new Error(`Transform ${index + 1}: extract pattern must be a string`);
    }

    const validation = validateExtractPattern(pattern);
    if (!validation.valid) {
      throw new Error(`Transform ${index + 1}: ${validation.reason}`);
    }
  }

  return data;
};

/**
 * Detect an active transform that MOVES a protected field path to a different
 * field, which deletes it.
 *
 * Several ingest stages read a value at a fixed path that the config promises
 * will exist (the external-ID path, geo/time mapping overrides). `rename` and
 * `string-op` delete their source field when they write to a different target;
 * the other transform types read their source but leave it in place. So a
 * `rename`/`string-op` whose `from` equals the protected path and whose target
 * differs deletes that path — leaving the downstream stage reading `undefined`.
 * Returns the offending transform, or `null` if the path survives.
 *
 * Only active transforms are considered, mirroring the runtime filter in
 * `buildTransformsFromDataset` (inactive transforms never run).
 */
export const findTransformMovingAwayPath = (
  transforms: Array<Record<string, unknown>>,
  protectedPath: string
): { index: number; from: string; to: string } | null => {
  if (!protectedPath) return null;

  for (const [index, transform] of transforms.entries()) {
    if (!transform || transform.active !== true) continue;
    if (transform.type !== "rename" && transform.type !== "string-op") continue;
    if (transform.from !== protectedPath) continue;

    // A target equal to the source is an in-place edit (no deletion). Only a
    // different, non-empty target moves the value away and deletes the source.
    const to = typeof transform.to === "string" ? transform.to : "";
    if (to && to !== protectedPath) {
      return { index, from: protectedPath, to };
    }
  }

  return null;
};

/**
 * Detect a transform that moves the external-ID field away.
 *
 * For the `external` ID strategy, duplicate analysis derives the uniqueId from
 * only the transforms that *produce* `externalIdPath`, while event creation
 * runs the full transform set (see analyze-duplicates-job and create-events).
 * A move-away of `externalIdPath` makes the two stages derive different IDs (or
 * fail ID generation), silently breaking deduplication.
 */
export const findExternalIdMoveAway = (
  idStrategy: unknown,
  transforms: Array<Record<string, unknown>>
): { index: number; from: string; to: string } | null => {
  if (!idStrategy || typeof idStrategy !== "object") return null;
  const strategy = idStrategy as { type?: unknown; externalIdPath?: unknown };
  if (strategy.type !== "external") return null;

  const idPath = typeof strategy.externalIdPath === "string" ? strategy.externalIdPath : "";
  return findTransformMovingAwayPath(transforms, idPath);
};

/** Geo/time mapping fields whose paths event creation and geocoding read directly. */
const MAPPING_PATH_FIELDS = [
  ["latitudePath", "latitude"],
  ["longitudePath", "longitude"],
  ["locationPath", "location"],
  ["locationNamePath", "location name"],
  ["timestampPath", "timestamp"],
  ["endTimestampPath", "end timestamp"],
] as const;

/**
 * Collect the user-set geo/time mapping paths that downstream stages read.
 *
 * These come from the dataset's `fieldMappingOverrides` and `geoFieldDetection`
 * groups. Auto-detected mappings are computed from already-transformed rows so
 * they can never point at a deleted field — only these explicit overrides can.
 * Returns de-duplicated `{ path, label }` entries so callers can name the
 * offending mapping in an error.
 */
export const collectProtectedMappingPaths = (
  overrides: unknown,
  geo: unknown
): Array<{ path: string; label: string }> => {
  const seen = new Set<string>();
  const result: Array<{ path: string; label: string }> = [];

  const add = (source: unknown, field: string, label: string): void => {
    if (!source || typeof source !== "object") return;
    const value = (source as Record<string, unknown>)[field];
    if (typeof value !== "string") return;
    const path = value.trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    result.push({ path, label });
  };

  for (const [field, label] of MAPPING_PATH_FIELDS) {
    add(overrides, field, label);
  }
  // geoFieldDetection only carries lat/lng.
  add(geo, "latitudePath", "latitude");
  add(geo, "longitudePath", "longitude");

  return result;
};

/**
 * Read a dataset config value from the incoming patch, falling back to the
 * stored document. Payload replaces whole groups/arrays on write (it does not
 * deep-merge), so a partial PATCH that omits a group leaves it absent from
 * `data` while `originalDoc` holds the prior value — `data ?? originalDoc` at
 * group granularity validates the effective post-write config in both cases.
 */
const mergedConfigValue = <T>(data: Record<string, unknown> | undefined, originalDoc: unknown, key: string): T =>
  (data?.[key] ?? (originalDoc as Record<string, unknown> | undefined)?.[key]) as T;

const getMergedTransforms = (
  data: Record<string, unknown> | undefined,
  originalDoc: unknown
): Array<Record<string, unknown>> => {
  const transforms = mergedConfigValue<unknown>(data, originalDoc, "ingestTransforms");
  return Array.isArray(transforms) ? (transforms as Array<Record<string, unknown>>) : [];
};

/**
 * Reject `external` ID strategy configs without an `externalIdPath`. Without it
 * every imported row fails ID generation ("Missing external ID").
 */
export const validateExternalIdPresent: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation !== "create" && operation !== "update") return data;

  const idStrategy = mergedConfigValue<{ type?: unknown; externalIdPath?: unknown } | undefined>(
    data,
    originalDoc,
    "idStrategy"
  );
  if (idStrategy?.type !== "external") return data;

  const path = typeof idStrategy.externalIdPath === "string" ? idStrategy.externalIdPath.trim() : "";
  if (!path) {
    throw new Error(
      'The "External ID from Source" strategy requires an External ID Path. ' +
        "Set the path to the source field that holds the unique ID, or choose a different ID strategy."
    );
  }

  return data;
};

/**
 * Reject dataset configs where an active transform moves the external-ID field
 * to a different path, which would make duplicate analysis and event creation
 * derive different uniqueIds. See {@link findExternalIdMoveAway}.
 */
export const validateExternalIdTransforms: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation !== "create" && operation !== "update") return data;

  const transforms = getMergedTransforms(data, originalDoc);
  if (transforms.length === 0) return data;

  const idStrategy = mergedConfigValue<unknown>(data, originalDoc, "idStrategy");
  const offender = findExternalIdMoveAway(idStrategy, transforms);
  if (offender) {
    throw new Error(
      `Transform ${offender.index + 1} moves the external ID field "${offender.from}" to "${offender.to}". ` +
        `The external ID strategy needs this field to stay in place. Rename the source field to "${offender.from}" ` +
        `instead, or point the external ID path at "${offender.to}".`
    );
  }

  return data;
};

/**
 * Reject configs where an active transform moves away a field that a user-set
 * geo/time mapping override points at, which would silently produce events with
 * no coordinates or timestamp. See {@link collectProtectedMappingPaths}.
 */
export const validateMappingOverrideTransforms: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation !== "create" && operation !== "update") return data;

  const transforms = getMergedTransforms(data, originalDoc);
  if (transforms.length === 0) return data;

  const overrides = mergedConfigValue<unknown>(data, originalDoc, "fieldMappingOverrides");
  const geo = mergedConfigValue<unknown>(data, originalDoc, "geoFieldDetection");

  for (const { path, label } of collectProtectedMappingPaths(overrides, geo)) {
    const offender = findTransformMovingAwayPath(transforms, path);
    if (offender) {
      throw new Error(
        `Transform ${offender.index + 1} moves the field "${offender.from}" to "${offender.to}", but the ${label} ` +
          `mapping points at "${offender.from}". Update the ${label} mapping to "${offender.to}" or remove the transform.`
      );
    }
  }

  return data;
};

export const validatePublicCatalogDataset: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  // Set createdBy on creation
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }

  // Validate private imports are allowed
  if (operation === "create" || operation === "update") {
    await validatePrivateImportAllowed(req, data?.isPublic);
  }

  // Process catalog validation and set denormalized fields
  if ((operation === "create" || operation === "update") && data?.catalog) {
    try {
      const catalogFields = await processCatalogValidation(req, data.catalog, data.isPublic, operation, originalDoc);
      Object.assign(data, catalogFields);
    } catch (error) {
      // Re-throw validation errors, swallow others (catalog not found)
      if (
        error instanceof Error &&
        (error.message.includes("must be public") || error.message.includes("can only create"))
      ) {
        throw error;
      }
    }
  }

  return data;
};

const DATASET_NAME_CONFLICT_MESSAGE = "A dataset with this name already exists in this catalog.";
/** Name of the unique index enforcing (catalog_id, name) uniqueness on datasets.
 *  Kept in sync with migrations/20260417_100000_datasets_catalog_name_unique.ts. */
const DATASET_CATALOG_NAME_UNIQUE_INDEX = "datasets_catalog_name_unique";

/**
 * Validates that dataset names are unique within a catalog.
 *
 * This hook does an optimistic find-first check for clean UX (most conflicts
 * are caught here before the INSERT is attempted). The authoritative guarantee
 * is the DB-level unique index on `(catalog_id, name)` — see
 * `migrations/20260417_100000_datasets_catalog_name_unique.ts`. That index
 * closes the TOCTOU race where two concurrent writers both pass the find
 * check; the `handleDatasetUniqueConstraintError` afterError hook translates
 * the resulting PG 23505 error into the same user-friendly message.
 */
export const validateDatasetNameUniqueness: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (operation !== "create" && operation !== "update") return data;

  const name = data?.name;
  const catalogRef = data?.catalog;
  if (!name || !catalogRef) return data;

  const catalogId = extractRelationId(catalogRef);
  if (!catalogId) return data;

  const conditions: Where[] = [{ name: { equals: name } }, { catalog: { equals: catalogId } }];

  // Exclude current document on update
  if (operation === "update" && originalDoc?.id) {
    conditions.push({ id: { not_equals: originalDoc.id } });
  }

  const existing = await req.payload.find({
    collection: "datasets",
    where: { and: conditions },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });

  if (existing.docs.length > 0) {
    throw new Error(DATASET_NAME_CONFLICT_MESSAGE);
  }

  return data;
};

/**
 * Translates the PG 23505 error from the `datasets_catalog_name_unique`
 * partial index into the same user-friendly message thrown by
 * `validateDatasetNameUniqueness`. The DB index fires when concurrent writers
 * both pass the optimistic find-first check — without this hook, the admin UI
 * would show a raw PostgreSQL error for the race case.
 *
 * This covers REST and GraphQL flows; local API callers still receive the
 * underlying PG error and can inspect `error.code === "23505"` if they care.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- signature is async per Payload's AfterErrorHook contract
export const handleDatasetUniqueConstraintError: CollectionAfterErrorHook = async ({ error }) => {
  const err = error as (Error & { code?: string; constraint?: string; message?: string }) | undefined;
  if (!err) return;
  const message = err.message ?? "";
  const isUniqueViolation =
    err.code === "23505" ||
    err.constraint === DATASET_CATALOG_NAME_UNIQUE_INDEX ||
    message.includes(DATASET_CATALOG_NAME_UNIQUE_INDEX);

  if (isUniqueViolation) {
    throw new Error(DATASET_NAME_CONFLICT_MESSAGE);
  }
};

type DatasetAccessSyncState = {
  combinedIsPublic: boolean;
  didCatalogOwnerChange: boolean;
  didCatalogVisibilityChange: boolean;
  didDatasetVisibilityChange: boolean;
  nextCatalogOwnerId: number | null;
};

const getDatasetAccessSyncState = (doc: Dataset, previousDoc?: Partial<Dataset>): DatasetAccessSyncState => {
  const nextCatalogOwnerId = doc.catalogCreatorId ?? null;
  const previousCatalogOwnerId = previousDoc?.catalogCreatorId ?? null;

  return {
    combinedIsPublic: (doc.isPublic ?? false) && (doc.catalogIsPublic ?? false),
    didDatasetVisibilityChange: (previousDoc?.isPublic ?? false) !== (doc.isPublic ?? false),
    didCatalogVisibilityChange: (previousDoc?.catalogIsPublic ?? false) !== (doc.catalogIsPublic ?? false),
    didCatalogOwnerChange: previousCatalogOwnerId !== nextCatalogOwnerId,
    nextCatalogOwnerId,
  };
};

const auditDatasetVisibilityChange = async (
  req: PayloadRequest,
  doc: Dataset,
  previousDoc?: Partial<Dataset>
): Promise<void> => {
  const datasetOwnerId = extractRelationId<number>(doc.createdBy);
  if (!datasetOwnerId) return;

  try {
    const owner = await req.payload.findByID({
      collection: "users",
      id: datasetOwnerId,
      overrideAccess: true,
      depth: 0,
      req,
    });
    await auditLog(
      req.payload,
      {
        action: AUDIT_ACTIONS.DATASET_VISIBILITY_CHANGED,
        userId: datasetOwnerId,
        userEmail: owner.email,
        performedBy: req.user?.id === datasetOwnerId ? undefined : req.user?.id,
        details: {
          datasetId: doc.id,
          datasetName: doc.name,
          previousIsPublic: previousDoc?.isPublic ?? false,
          newIsPublic: doc.isPublic ?? false,
        },
      },
      { req }
    );
  } catch {
    /* audit is best-effort */
  }
};

const syncDatasetChildAccessFields = async (
  req: PayloadRequest,
  datasetId: number,
  accessFields: { catalogOwnerId: number | null; datasetIsPublic: boolean }
): Promise<void> => {
  await req.payload.update({
    collection: "events",
    where: { dataset: { equals: datasetId } },
    data: accessFields,
    overrideAccess: true,
    req,
  });

  await req.payload.update({
    collection: "dataset-schemas",
    where: { dataset: { equals: datasetId } },
    data: accessFields,
    overrideAccess: true,
    req,
  });
};

/**
 * Sync dataset access-control changes to all child records in this dataset.
 *
 * Updates the denormalized `datasetIsPublic` and `catalogOwnerId` fields used
 * by events and dataset schemas for access control.
 */
export const syncIsPublicToEvents: CollectionAfterChangeHook<Dataset> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== "update") return doc;

  const syncState = getDatasetAccessSyncState(doc, previousDoc);

  if (
    !syncState.didDatasetVisibilityChange &&
    !syncState.didCatalogVisibilityChange &&
    !syncState.didCatalogOwnerChange
  ) {
    return doc;
  }

  if (syncState.didDatasetVisibilityChange) {
    await auditDatasetVisibilityChange(req, doc, previousDoc);
  }

  const accessFields = { datasetIsPublic: syncState.combinedIsPublic, catalogOwnerId: syncState.nextCatalogOwnerId };

  logger.info(
    { datasetId: doc.id, datasetIsPublic: syncState.combinedIsPublic, catalogOwnerId: syncState.nextCatalogOwnerId },
    "Syncing dataset access fields to events and dataset schemas"
  );

  await syncDatasetChildAccessFields(req, doc.id, accessFields);

  return doc;
};
