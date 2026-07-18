/**
 * Access control rules for import jobs collection.
 *
 * @module
 */
import type { Access } from "payload";

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

  // Only editors and admins can update via the generic REST API.
  //
  // Owners must NOT get generic update access: the ingest-job fields (`stage`,
  // `schemaValidation.approved`, `dataset`, `duplicates.summary.*`, `schema`,
  // `interpretationPlan`, ...) drive the pipeline and are only `admin.readOnly`
  // (UI-only) — they carry no field-level write guard. A generic owner PATCH
  // could therefore flip `stage`→needs-review then `approved`→true to force the
  // afterChange hook to queue the workflow with a forged duplicates summary
  // (bypassing the per-import quota check), or reassign `dataset` to an
  // unauthorized target. Every legitimate owner mutation flows through the
  // dedicated endpoints (`/approve`, `/reset`, `/retry`), which run via the
  // Local API with overrideAccess — so this restriction closes the tampering
  // surface without breaking any real flow. Owners keep read access above.
  update: isEditorOrAdmin,

  // Only admins and editors can delete
  delete: isEditorOrAdmin,

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
