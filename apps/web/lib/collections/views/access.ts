/**
 * Access control logic for the Views collection.
 *
 * Uses the shared public-ownership factory since Views follows the standard
 * pattern: public items visible to all, private items visible to owner/admin.
 *
 * @module
 * @category Collections
 */
import { createPublicOwnershipAccess } from "../shared-fields";

export const { read, create, update, deleteAccess, readVersions } = createPublicOwnershipAccess();
