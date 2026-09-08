/**
 * Access control rules for import files collection.
 *
 * @module
 */
import type { Access, Where } from "payload";

import { extractRelationId } from "@/lib/utils/relation-id";

import { createFeatureFlaggedCreateAccess, isEditorOrAdmin, isPrivileged } from "../shared-fields";

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
  create: createFeatureFlaggedCreateAccess("enableImportCreation"),

  // Sources and pipeline state are immutable to API/admin clients. Replacing
  // bytes bypasses create-time quotas and invalidates queued work and sidecars.
  // Internal pipeline/recovery/cleanup writers use Payload's Local API override.
  update: () => false,

  // Only admins and editors can delete
  delete: isEditorOrAdmin,

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
