/**
 * @module Provides shared, reusable components for defining Payload CMS collections.
 *
 * This module contains helper functions and constant definitions to promote consistency
 * and reduce boilerplate code across different collection configurations. It includes:
 * - Access control helpers (e.g., `isEditorOrAdmin`).
 * - Common field definitions (e.g., `basicMetadataFields`, `metadataField`).
 * - A factory function (`createSlugField`) for generating URL-friendly slugs.
 * - A factory function (`createCommonConfig`) to apply standard collection-level settings
 *   like timestamps, versioning, and drafts.
 */
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { Access, Field } from "payload";

import type { Config } from "@/payload-types";

import { createSlugHook } from "../utils/slug";

// Access control helper for role-based permissions
export const isEditorOrAdmin: Access = ({ req: { user } }) => user?.role === "editor" || user?.role === "admin";

// Basic metadata fields common to many entities
export const basicMetadataFields: Field[] = [
  {
    name: "name",
    type: "text",
    required: true,
    maxLength: 255,
  },
  {
    name: "description",
    type: "richText",
    editor: lexicalEditor({}),
  },
];

// Slug field with customizable source
export const createSlugField = <T extends keyof Config["collections"]>(collection: T, sourceField = "name"): Field => ({
  name: "slug",
  type: "text",
  maxLength: 255,
  unique: true,
  admin: {
    position: "sidebar",
    description: "URL-friendly identifier (auto-generated from name if not provided)",
  },
  hooks: {
    beforeValidate: [createSlugHook(collection, { sourceField })],
  },
});

// Generic metadata JSON field
export const metadataField: Field = {
  name: "metadata",
  type: "json",
  admin: {
    description: "Additional metadata for the entity",
  },
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
    versions?: {
      maxPerDoc: number;
      drafts?: {
        autosave: boolean;
      };
    };
  } = {
    timestamps,
    trash,
  };

  if (versions && drafts) {
    config.versions = {
      maxPerDoc,
      drafts: {
        autosave: true,
      },
    };
  }

  if (versions && !drafts) {
    config.versions = {
      maxPerDoc,
    };
  }

  return config;
};
