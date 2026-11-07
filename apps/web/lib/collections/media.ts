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
  isEditorOrAdmin,
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
    // Raster types only, enumerated deliberately: an SVG is an active document, and media
    // `read` is public and served inline from this origin with no script-src CSP, so an
    // uploaded <script> would run with the session of any admin opening the file URL.
    mimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"],
  },
  admin: {
    useAsTitle: "filename",
    defaultColumns: ["filename", "alt", "mimeType", "filesize", "createdAt", "createdBy"],
    group: "Content",
  },
  access: {
    read: () => {
      // All media is readable: images are used in public pages.
      return true;
    },

    // Media are CMS assets; only editors and admins have the admin UI that uses them.
    create: isEditorOrAdmin,

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
