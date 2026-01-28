/**
 * Access control logic for the Views collection.
 *
 * Defines read, create, update, and delete permissions based on:
 * - User role (admin/editor has full access)
 * - Public/private status of views
 * - View ownership (via createdBy field)
 *
 * @module
 * @category Collections
 */
import type { Access, Where } from "payload";

/**
 * Read access: Public views are readable by all, private views by owner/admin.
 */
// eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
export const read: Access = ({ req: { user } }): boolean | Where => {
  // Admin and editor can read all
  if (user?.role === "admin" || user?.role === "editor") return true;

  // Logged-in users can see: public views OR views they created
  if (user) {
    return {
      or: [{ isPublic: { equals: true } }, { createdBy: { equals: user.id } }],
    } as Where;
  }

  // Anonymous users only see public views
  return { isPublic: { equals: true } } as Where;
};

/**
 * Create access: Any authenticated user can create views.
 * Admin and editor roles can always create.
 */
export const create: Access = ({ req: { user } }) => !!user;

/**
 * Update access: Admins/editors can update all views, creators can update their own.
 */
// eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
export const update: Access = ({ req: { user } }): boolean | Where => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "editor") return true;

  // Creator can update their own views
  return { createdBy: { equals: user.id } } as Where;
};

/**
 * Delete access: Admins/editors can delete all views, creators can delete their own.
 * Uses same logic as update access.
 */
export const deleteAccess: Access = update;

/**
 * ReadVersions access: Only admins and editors can read version history.
 */
export const readVersions: Access = ({ req: { user } }) => user?.role === "admin" || user?.role === "editor";
