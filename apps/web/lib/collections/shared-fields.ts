/**
 * Provides shared, reusable components for defining Payload CMS collections.
 *
 * This module contains helper functions and constant definitions to promote consistency
 * and reduce boilerplate code across different collection configurations. It includes:
 * - Access control helpers (e.g., `isEditorOrAdmin`).
 * - Common field definitions (e.g., `basicMetadataFields`, `metadataField`).
 * - A factory function (`createSlugField`) for generating URL-friendly slugs.
 * - A factory function (`createCommonConfig`) to apply standard collection-level settings
 *   like timestamps, versioning, and drafts.
 *
 * @module
 */
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { Access, CollectionBeforeChangeHook, Field, Where } from "payload";

import type { Config } from "@/payload-types";

import { createSlugHook } from "./slug";

// Access control helpers for role-based permissions

/** Plain boolean helper for checking admin or editor role outside Payload Access context. */
export const isPrivileged = (user?: { role?: string | null } | null): boolean =>
  user?.role === "admin" || user?.role === "editor";

export const isAdmin: Access = ({ req: { user } }) => user?.role === "admin";
export const isEditorOrAdmin: Access = ({ req: { user } }) => isPrivileged(user);
export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user);

/**
 * Access control that denies create operations for users with pending account deletion.
 * Wraps an existing Access function, adding the deletion-status guard on top.
 * Use this for collections where pending-deletion users should not be able to create new data.
 */
export const denyPendingDeletion =
  (inner: Access): Access =>
  // eslint-disable-next-line sonarjs/function-return-type -- wrapping Access inherently returns mixed types
  (args) => {
    const user = args.req.user;
    if (user && (user as { deletionStatus?: string }).deletionStatus === "pending_deletion") {
      return false;
    }
    return inner(args);
  };

/**
 * Factory for ownership-based access control.
 * Returns true for editors/admins, or a WHERE clause filtering by ownership field.
 * Uses zero-query approach (WHERE clause) instead of per-document DB lookup.
 */
export const createOwnershipAccess = (
  _collection: string,
  ownerField: "createdBy" | "ownedBy" | "user" | "repoCreatedBy" | "scraperOwner" = "createdBy"
): Access => {
  // Payload Access functions legitimately return boolean | Where
  // eslint-disable-next-line sonarjs/function-return-type
  return ({ req: { user } }): boolean | Where => {
    if (isPrivileged(user)) return true;
    if (!user) return false;
    return { [ownerField]: { equals: user.id } };
  };
};

/**
 * Access control bundle for collections with public visibility + ownership.
 *
 * Provides all five access functions for collections where:
 * - Documents have an `isPublic` field controlling anonymous visibility
 * - Documents have an owner field (default: `createdBy`) for per-user access
 * - Editors/admins have full access
 *
 * Used by Sites and Views collections to eliminate duplicated access logic.
 */
export const createPublicOwnershipAccess = (
  ownerField: "createdBy" | "ownedBy" | "user" | "repoCreatedBy" | "scraperOwner" = "createdBy"
): { read: Access; create: Access; update: Access; deleteAccess: Access; readVersions: Access } => {
  // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
  const update: Access = ({ req: { user } }): boolean | Where => {
    if (!user) return false;
    if (isPrivileged(user)) return true;
    return { [ownerField]: { equals: user.id } };
  };

  return {
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: ({ req: { user } }): boolean | Where => {
      if (isPrivileged(user)) return true;
      if (user) {
        return { or: [{ isPublic: { equals: true } }, { [ownerField]: { equals: user.id } }] };
      }
      return { isPublic: { equals: true } };
    },
    create: isAuthenticated,
    update,
    deleteAccess: update,
    readVersions: isEditorOrAdmin,
  };
};

/**
 * Hook that sets the createdBy field to the current user on document creation.
 * Use in beforeChange hooks for collections with a createdBy relationship field.
 */
export const setCreatedByHook: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }
  // Defense in depth: prevent user-initiated updates from changing createdBy
  // System operations (e.g., account deletion ownership transfer) need to update createdBy
  if (operation === "update" && req.user) {
    delete data.createdBy;
  }
  return data;
};

// Basic metadata fields common to many entities
export const basicMetadataFields: Field[] = [
  { name: "name", type: "text", required: true, maxLength: 255 },
  { name: "description", type: "richText", editor: lexicalEditor({}) },
];

// Slug field with customizable source
export const createSlugField = <T extends keyof Config["collections"]>(collection: T, sourceField = "name"): Field => ({
  name: "slug",
  type: "text",
  maxLength: 255,
  unique: true,
  admin: { position: "sidebar", description: "URL-friendly identifier (auto-generated from name if not provided)" },
  hooks: { beforeValidate: [createSlugHook(collection, { sourceField })] },
});

// Field factories for common field definitions

/** Create a createdBy relationship field pointing to users. */
export const createCreatedByField = (description: string, options?: { required?: boolean }): Field => ({
  name: "createdBy",
  type: "relationship",
  relationTo: "users",
  ...(options?.required && { required: true }),
  admin: { position: "sidebar", readOnly: true, description },
});

/** Create an isPublic checkbox field with optional private visibility notice. */
export const createIsPublicField = (options?: {
  defaultValue?: boolean;
  description?: string;
  showPrivateNotice?: boolean;
}): Field => ({
  name: "isPublic",
  type: "checkbox",
  defaultValue: options?.defaultValue ?? false,
  admin: {
    position: "sidebar",
    ...(options?.description && { description: options.description }),
    ...((options?.showPrivateNotice ?? false) && {
      components: { afterInput: ["/components/admin/private-visibility-notice"] },
    }),
  },
});

/** Admin condition: only show field to editors and admins. */
export const editorOrAdminCondition = ({ req }: { req?: { user?: { role?: string } | null } }): boolean =>
  isPrivileged(req?.user);

// Generic metadata JSON field
export const metadataField: Field = {
  name: "metadata",
  type: "json",
  admin: { description: "Additional metadata for the entity" },
};

// Collection configuration helpers
export interface CommonCollectionOptions {
  versions?: boolean;
  drafts?: boolean;
  maxPerDoc?: number;
  trash?: boolean;
  timestamps?: boolean;
}

export const createCommonConfig = (options: CommonCollectionOptions = {}) => {
  const { versions = true, drafts = true, maxPerDoc = 0, trash = true, timestamps = true } = options;

  const config: {
    timestamps: boolean;
    trash: boolean;
    versions?: { maxPerDoc: number; drafts?: { autosave: boolean } };
  } = { timestamps, trash };

  if (versions && drafts) {
    config.versions = { maxPerDoc, drafts: { autosave: true } };
  }

  if (versions && !drafts) {
    config.versions = { maxPerDoc };
  }

  return config;
};
