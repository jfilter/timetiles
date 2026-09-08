/**
 * Access control rules for import files collection.
 *
 * @module
 */
import { createFeatureFlaggedCreateAccess, createOwnershipAccess, isEditorOrAdmin } from "../shared-fields";

export const ingestFilesAccess = {
  // Payload applies ownership in the same query and transaction as the read.
  read: createOwnershipAccess("user"),

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
