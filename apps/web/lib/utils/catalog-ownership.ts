/**
 * Catalog ownership validation utility.
 *
 * Used by import-files and dataset-detection-job to verify that a user
 * has access to a catalog before targeting it for imports.
 *
 * @module
 * @category Utils
 */
import type { Payload } from "payload";

import { extractRelationId } from "./relation-id";

/**
 * Validates that a user has access to a catalog (owns it or it's public).
 * Admin/editor users bypass this check.
 *
 * @throws Error if the user does not have access to the catalog
 */
export const validateCatalogOwnership = async (
  payload: Payload,
  catalogRef: unknown,
  user: { id: number; role?: string | null }
): Promise<void> => {
  const isAdminOrEditor = user.role === "admin" || user.role === "editor";
  if (isAdminOrEditor) return;

  const catalogId = extractRelationId<number>(catalogRef as number | { id: number } | null | undefined);
  if (!catalogId) return;

  const catalog = await payload.findByID({ collection: "catalogs", id: catalogId, overrideAccess: true });
  const catalogOwnerId = extractRelationId(catalog?.createdBy);
  const isPublicCatalog = catalog?.isPublic ?? false;

  if (catalogOwnerId !== user.id && !isPublicCatalog) {
    throw new Error("You can only import files into your own or public catalogs");
  }
};
