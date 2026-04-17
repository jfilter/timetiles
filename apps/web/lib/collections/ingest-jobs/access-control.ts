/**
 * Access control rules for import jobs collection.
 *
 * @module
 */
import type { Access } from "payload";

import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";

import { isEditorOrAdmin, isPrivileged } from "../shared-fields";

export const ingestJobsAccess = {
  // Import jobs can be read by the import file owner, editors, or admins
  // eslint-disable-next-line sonarjs/function-return-type -- Payload access functions intentionally return boolean or where filters
  read: (({ req }) => {
    const { user } = req;
    if (isPrivileged(user)) return true;

    if (!user) return false;

    // Let Payload resolve ownership through the ingestFile relationship
    // instead of materializing every owned file ID into memory.
    return { "ingestFile.user": { equals: user.id } };
  }) as Access,

  // Only authenticated users can create import jobs (if feature enabled)
  create: (async ({ req: { user, payload } }) => {
    if (!user) return false;

    // Check feature flag - even admins can't create if disabled
    const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
    // eslint-disable-next-line @typescript-eslint/return-await -- Returning awaited promise is intentional for async access control
    return await getFeatureFlagService(payload).isEnabled("enableImportCreation");
  }) as Access,

  // Only import file owner, editors, or admins can update
  update: (async ({ req, id }) => {
    const { user } = req;
    if (isPrivileged(user)) return true;

    // Security: Check ownership of EXISTING job, not the new data being set
    if (user && id) {
      try {
        const existingJob = await req.payload.findByID({ collection: "ingest-jobs", id, overrideAccess: true });

        if (existingJob?.ingestFile) {
          const ingestFileId = requireRelationId(existingJob.ingestFile, "ingestJob.ingestFile");
          const ingestFile = await req.payload.findByID({
            collection: "ingest-files",
            id: ingestFileId,
            overrideAccess: true,
          });

          if (ingestFile?.user) {
            const userId = extractRelationId(ingestFile.user);
            return user.id === userId;
          }
        }
      } catch {
        return false;
      }
    }

    return false;
  }) as Access,

  // Only admins and editors can delete
  delete: isEditorOrAdmin,

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
