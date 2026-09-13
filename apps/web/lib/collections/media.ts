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
import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";

import { getEnv } from "@/lib/config/env";

import {
  createCommonConfig,
  createCreatedByField,
  createOwnershipAccess,
  isAuthenticated,
  setCreatedByHook,
} from "./shared-fields";

const STORAGE_FIELDS = ["filename", "mimeType", "url", "thumbnailURL", "filesize", "width", "height", "sizes"] as const;

// Keep Payload's original upload fields/validators: redeclaring them can replace
// its MIME validator with the default text validator during config sanitization.
const preserveUploadMetadata: CollectionBeforeValidateHook = ({ data, operation, originalDoc, req }) => {
  if (operation !== "update" || !req.user || Boolean(req.file) || !data) return data;
  const restored = { ...data };
  for (const field of STORAGE_FIELDS) {
    if (field in restored) restored[field] = originalDoc?.[field];
  }
  return restored;
};

const Media: CollectionConfig = {
  slug: "media",
  ...createCommonConfig({ versions: false }),
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
    update: createOwnershipAccess(),
    delete: createOwnershipAccess(),
  },
  fields: [
    createCreatedByField("User who uploaded this media"),
    { name: "alt", type: "text", admin: { description: "Alternative text for accessibility" } },
  ],
  hooks: { beforeValidate: [preserveUploadMetadata], beforeChange: [setCreatedByHook] },
};

export default Media;
