/**
 * Defines the Payload CMS global configuration for Branding.
 *
 * Manages site-wide branding including site name, description, logos for
 * light/dark themes, and favicon source images. Favicon files are
 * auto-generated via afterChange hook when favicon sources change.
 *
 * @module
 * @category Globals
 */
import type { GlobalConfig } from "payload";

import { isPrivileged } from "@/lib/collections/shared-fields";

import { generateFaviconsHook } from "./branding-hooks";

// Reject control characters (CR/LF/NULL/tabs, etc.) so values safely flow into
// email headers/subjects. Complements runtime sanitization in lib/email/branding.ts.
// eslint-disable-next-line sonarjs/no-control-regex -- intentional: reject control characters including CR/LF
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

const validateNoControlChars = (value: string | null | undefined): true | string => {
  if (typeof value !== "string" || value.length === 0) return true;
  if (CONTROL_CHAR_REGEX.test(value)) {
    return "Must not contain control characters (e.g. line breaks or tabs).";
  }
  return true;
};

export const Branding: GlobalConfig = {
  slug: "branding",
  admin: { group: "Content" },
  access: { read: () => true, update: ({ req: { user } }) => isPrivileged(user) },
  hooks: { afterChange: [generateFaviconsHook] },
  fields: [
    {
      name: "siteName",
      type: "text",
      label: "Site Name",
      localized: true,
      defaultValue: "TimeTiles",
      validate: validateNoControlChars,
      admin: { description: "The name displayed in the header and browser tab title" },
    },
    {
      name: "siteDescription",
      type: "textarea",
      label: "Site Description",
      localized: true,
      defaultValue: "Making spatial and temporal data analysis accessible to everyone.",
      admin: { description: "Meta description for SEO and social sharing (og:description)" },
    },
    {
      type: "row",
      fields: [
        {
          name: "logoLight",
          type: "upload",
          relationTo: "media",
          label: "Logo (Light Theme)",
          admin: {
            description: "Logo for light backgrounds. Recommended: 128x128px PNG with transparency.",
            width: "50%",
          },
        },
        {
          name: "logoDark",
          type: "upload",
          relationTo: "media",
          label: "Logo (Dark Theme)",
          admin: {
            description: "Logo for dark backgrounds. Recommended: 128x128px PNG with transparency.",
            width: "50%",
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "faviconSourceLight",
          type: "upload",
          relationTo: "media",
          label: "Favicon (Light Theme)",
          admin: {
            description: "Source image for light theme favicons. Recommended: 512x512px square PNG.",
            width: "50%",
          },
        },
        {
          name: "faviconSourceDark",
          type: "upload",
          relationTo: "media",
          label: "Favicon (Dark Theme)",
          admin: {
            description: "Source image for dark theme favicons. Recommended: 512x512px square PNG.",
            width: "50%",
          },
        },
      ],
    },
  ],
};
