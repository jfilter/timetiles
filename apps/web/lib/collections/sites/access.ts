/**
 * Access control logic for the Sites collection.
 *
 * Sites creation is restricted to editors/admins to prevent domain
 * takeover attacks (where any user could claim a production domain).
 * Read/update/delete follow the standard public-ownership pattern.
 *
 * @module
 * @category Collections
 */
import { createPublicOwnershipAccess, isEditorOrAdmin } from "../shared-fields";

const ownershipAccess = createPublicOwnershipAccess();

export const read = ownershipAccess.read;
export const create = isEditorOrAdmin;
export const update = ownershipAccess.update;
export const deleteAccess = ownershipAccess.deleteAccess;
export const readVersions = ownershipAccess.readVersions;
