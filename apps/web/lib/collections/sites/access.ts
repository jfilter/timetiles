/**
 * Access control logic for the Sites collection.
 *
 * Defines read, create, update, and delete permissions based on:
 * - User role (admin/editor has full access)
 * - Public/private status of sites
 * - Site ownership (via createdBy field)
 *
 * @module
 * @category Collections
 */
import type { Access, Where } from "payload";

import { isAuthenticated, isEditorOrAdmin } from "../shared-fields";

/**
 * Read access: Public sites are readable by all, private sites by owner/admin.
 */
// eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
export const read: Access = ({ req: { user } }): boolean | Where => {
  // Admin and editor can read all
  if (user?.role === "admin" || user?.role === "editor") return true;

  // Logged-in users can see: public sites OR sites they created
  if (user) {
    return { or: [{ isPublic: { equals: true } }, { createdBy: { equals: user.id } }] } as Where;
  }

  // Anonymous users only see public sites
  return { isPublic: { equals: true } } as Where;
};

/**
 * Create access: Any authenticated user can create sites.
 */
export const create: Access = isAuthenticated;

/**
 * Update access: Admins/editors can update all sites, creators can update their own.
 */
// eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
export const update: Access = ({ req: { user } }): boolean | Where => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "editor") return true;

  // Creator can update their own sites
  return { createdBy: { equals: user.id } } as Where;
};

/**
 * Delete access: Admins/editors can delete all sites, creators can delete their own.
 */
export const deleteAccess: Access = update;

/**
 * ReadVersions access: Only admins and editors can read version history.
 */
export const readVersions: Access = isEditorOrAdmin;
