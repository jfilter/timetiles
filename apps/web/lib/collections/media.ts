/**
 * Defines the Payload CMS collection configuration for Media.
 *
 * This collection handles all media uploads, primarily images. It uses Payload's built-in
 * `upload` functionality to manage file storage and automatically generate different
 * image sizes (e.g., thumbnail, card, tablet) for responsive design.
 * It also includes a field for `alt` text to ensure accessibility.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import {
  createCommonConfig,
  createOwnershipAccess,
  isAuthenticated,
  isEditorOrAdmin,
  setCreatedByHook,
} from "./shared-fields";

const Media: CollectionConfig = {
  slug: "media",
  ...createCommonConfig(),
  upload: {
    staticDir: `${process.env.UPLOAD_DIR ?? "uploads"}/media`,
    imageSizes: [
      {
        name: "thumbnail",
        width: 400,
        height: 300,
        position: "centre",
      },
      {
        name: "card",
        width: 768,
        height: 1024,
        position: "centre",
      },
      {
        name: "tablet",
        width: 1024,
        height: undefined,
        position: "centre",
      },
    ],
    adminThumbnail: "thumbnail",
    mimeTypes: ["image/*"],
  },
  admin: {
    useAsTitle: "filename",
    defaultColumns: ["filename", "alt", "mimeType", "filesize", "createdAt", "createdBy"],
    group: "Content",
  },
  access: {
    // Public media is readable by all, private media only by owner/admins
    read: () => {
      // For now, all media is readable (images used in public pages)
      // Can be made stricter if private media uploads are needed
      return true;
    },

    // Only authenticated users can upload media
    create: isAuthenticated,

    // Only owner, editors, or admins can update/delete
    update: createOwnershipAccess("media"),
    delete: createOwnershipAccess("media"),

    // Only admins and editors can read version history
    readVersions: isEditorOrAdmin,
  },
  fields: [
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "User who uploaded this media",
      },
    },
    {
      name: "alt",
      type: "text",
      admin: {
        description: "Alternative text for accessibility",
      },
    },
  ],
  hooks: {
    beforeChange: [setCreatedByHook],
  },
};

export default Media;
