/**
 * Access control rules for import files collection.
 *
 * @module
 */
import type { Access, Where } from "payload";

import { extractRelationId } from "@/lib/utils/relation-id";

import { createOwnershipAccess, isEditorOrAdmin, isPrivileged } from "../shared-fields";

export const ingestFilesAccess = {
  // Import files can be read by their owner or admins

  read: (async ({ req, id }): Promise<boolean | Where> => {
    const { user, payload } = req;

    // Admins and editors can read all
    if (isPrivileged(user)) return true;

    // Authentication required
    if (!user) return false;

    // For findByID operations (id is provided)
    if (id) {
      try {
        // Fetch the file to check ownership
        const file = await payload.findByID({ collection: "ingest-files", id, overrideAccess: true });

        if (file?.user) {
          const userId = extractRelationId(file.user);
          return user.id === userId;
        }

        return false;
      } catch {
        return false;
      }
    }

    // For find operations (query-based filtering)
    return { user: { equals: user.id } };
  }) as Access,

  // Only authenticated users can upload files (denied for pending-deletion accounts, feature flag must be enabled)
  create: (async ({ req: { user, payload } }) => {
    // Check authentication + pending deletion first
    if (!user || user.deletionScheduledAt) return false;

    // Check feature flag - even admins can't create if disabled
    const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
    return getFeatureFlagService(payload).isEnabled("enableImportCreation");
  }) as Access,

  // Only file owner, editors, or admins can update
  update: createOwnershipAccess("ingest-files", "user"),

  // Only admins and editors can delete
  delete: isEditorOrAdmin,

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
