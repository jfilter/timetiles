/**
 * Access control rules for import files collection.
 *
 * @module
 */
import { createOwnershipAccess, createPrivilegedFlaggedCreateAccess, isEditorOrAdmin } from "../shared-fields";

export const ingestFilesAccess = {
  // Payload applies ownership in the same query and transaction as the read.
  read: createOwnershipAccess("user"),

  // Users import through the wizard routes (Local API); raw REST could name any dataset as target.
  create: createPrivilegedFlaggedCreateAccess("enableImportCreation"),

  // Sources and pipeline state are immutable to API/admin clients. Replacing
  // bytes bypasses create-time quotas and invalidates queued work and sidecars.
  // Internal pipeline/recovery/cleanup writers use Payload's Local API override.
  update: () => false,

  // Only admins and editors can delete
  delete: isEditorOrAdmin,

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
