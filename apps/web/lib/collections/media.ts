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

import { getEnv } from "@/lib/config/env";

import {
  createCommonConfig,
  createCreatedByField,
  createOwnershipAccess,
  isAuthenticated,
  isEditorOrAdmin,
  setCreatedByHook,
} from "./shared-fields";

const Media: CollectionConfig = {
  slug: "media",
  ...createCommonConfig(),
  upload: {
    staticDir: `${getEnv().UPLOAD_DIR}/media`,
    imageSizes: [
      { name: "thumbnail", width: 400, height: 300, position: "centre" },
      { name: "card", width: 768, height: 1024, position: "centre" },
      { name: "tablet", width: 1024, height: undefined, position: "centre" },
    ],
    adminThumbnail: "thumbnail",
    // Raster types only, enumerated deliberately. `image/*` accepted image/svg+xml, and an
    // SVG is an active document: any authenticated user could upload one containing a
    // <script>, and media `read` is public and served inline from this origin, so sending
    // the file URL to an admin executed it with their session. There is no script-src CSP to
    // fall back on. SVG also cannot be resized into the configured sizes anyway.
    mimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"],
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
    createCreatedByField("User who uploaded this media"),
    { name: "alt", type: "text", admin: { description: "Alternative text for accessibility" } },
  ],
  hooks: { beforeChange: [setCreatedByHook] },
};

export default Media;
