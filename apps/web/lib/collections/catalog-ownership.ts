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
    return (await req.payload.findByID({ collection, id, depth, overrideAccess: true, req })) as CollectionDoc<TSlug>;
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
): { datasetIsPublic: boolean; catalogOwnerId: number | undefined } => {
  const catalog = typeof dataset.catalog === "object" ? dataset.catalog : null;
  const catalogIsPublic = catalog?.isPublic ?? false;
  const datasetIsPublic = (dataset.isPublic ?? false) && catalogIsPublic;
  const catalogOwnerId = catalog?.createdBy ? extractRelationId<number>(catalog.createdBy) : undefined;
  return { datasetIsPublic, catalogOwnerId };
};
