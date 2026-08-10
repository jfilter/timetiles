/**
 * Catalog ownership and access control utilities.
 *
 * Shared by collection hooks (events, datasets) and import pipeline
 * to validate catalog access and extract denormalized access fields.
 *
 * @module
 * @category Collections
 */
import type { Payload, PayloadRequest } from "payload";

import { isPrivileged } from "@/lib/collections/shared-fields";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Config } from "@/payload-types";
import type { Dataset } from "@/payload-types";

type CollectionSlug = keyof Config["collections"];
type CollectionDoc<TSlug extends CollectionSlug> = Config["collections"][TSlug];

/**
 * Validates that a user has access to a catalog (owns it or it's public).
 * Admin/editor users bypass this check.
 *
 * @throws Error if the user does not have access to the catalog
 */
export const validateCatalogOwnership = async (
  payload: Payload,
  catalogRef: unknown,
  user: { id: number; role?: string | null },
  req?: PayloadRequest
): Promise<void> => {
  if (isPrivileged(user)) return;

  const catalogId = extractRelationId<number>(catalogRef as number | { id: number } | null | undefined);
  if (!catalogId) return;

  const catalog = await payload.findByID({ collection: "catalogs", id: catalogId, overrideAccess: true, req });
  const catalogOwnerId = extractRelationId(catalog?.createdBy);
  const isPublicCatalog = catalog?.isPublic ?? false;

  if (catalogOwnerId !== user.id && !isPublicCatalog) {
    throw new Error("You can only import files into your own or public catalogs");
  }
};

/**
 * Safe fetch by ID in a Payload hook context (uses `req` for transaction sharing).
 * Returns null instead of throwing on not-found or permission errors.
 */
export const safeFetchRecord = async <TSlug extends CollectionSlug>(
  req: PayloadRequest,
  collection: TSlug,
  id: number | string,
  depth = 0
): Promise<CollectionDoc<TSlug> | null> => {
  try {
    return await req.payload.findByID({ collection, id, depth, overrideAccess: true, req });
  } catch {
    return null;
  }
};

/**
 * Extract denormalized access control fields from a dataset with populated catalog.
 * Used by events and datasets hooks to set datasetIsPublic and catalogOwnerId.
 */
export const extractDenormalizedAccessFields = (
  dataset: Dataset
): { datasetIsPublic: boolean; catalogOwnerId: number | null } => {
  const catalog = typeof dataset.catalog === "object" ? dataset.catalog : null;
  const catalogIsPublic = catalog?.isPublic ?? false;
  const datasetIsPublic = (dataset.isPublic ?? false) && catalogIsPublic;
  // null, never undefined: an ownerless catalog has to CLEAR the denormalized owner —
  // Payload drops undefined from a write, which would leave the previous owner readable.
  const catalogOwnerId = catalog?.createdBy ? (extractRelationId<number>(catalog.createdBy) ?? null) : null;
  return { datasetIsPublic, catalogOwnerId };
};

/**
 * Marks a write as an internal resync of denormalized access-control fields.
 *
 * Those fields (`catalogCreatorId`, `catalogIsPublic`, `datasetIsPublic`,
 * `catalogOwnerId`) decide who may read a row, so a client must never set them
 * directly — but the cascades that keep them in sync run through the same
 * beforeChange hooks with the acting user's `req`. This marker is what tells the
 * two apart; `overrideAccess` cannot, because the cascades inherit `req.user`.
 */
const DENORM_SYNC_CONTEXT_KEY = "syncingDenormalizedAccessFields";

/** Run `fn` with denormalized-access-field writes marked as internal. */
export const withDenormSync = async <T>(req: PayloadRequest, fn: () => Promise<T>): Promise<T> => {
  req.context ??= {};
  const context = req.context;
  const previous = context[DENORM_SYNC_CONTEXT_KEY];
  context[DENORM_SYNC_CONTEXT_KEY] = true;
  try {
    return await fn();
  } finally {
    context[DENORM_SYNC_CONTEXT_KEY] = previous;
  }
};

/**
 * Strip client-supplied denormalized access fields.
 *
 * Returns `data` unchanged for internal resyncs and for writes with no acting
 * user (import jobs, seeds); otherwise removes the listed keys so the hook's own
 * derivation is the only thing that can set them.
 */
export const stripClientDenormFields = <T extends Record<string, unknown>>(
  data: T,
  req: PayloadRequest,
  keys: readonly string[]
): T => {
  if (!req.user || req.context?.[DENORM_SYNC_CONTEXT_KEY] === true) return data;

  const cleaned = { ...data };
  for (const key of keys) {
    delete cleaned[key];
  }
  return cleaned;
};
