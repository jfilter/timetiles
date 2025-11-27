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

import { generateFaviconsHook } from "./branding-hooks";

export const Branding: GlobalConfig = {
  slug: "branding",
  admin: {
    group: "Content",
  },
  access: {
    read: () => true,
    update: ({ req: { user } }) => user?.role === "admin" || user?.role === "editor",
  },
  hooks: {
    afterChange: [generateFaviconsHook],
  },
  fields: [
    {
      name: "siteName",
      type: "text",
      label: "Site Name",
      defaultValue: "TimeTiles",
      admin: {
        description: "The name displayed in the header and browser tab title",
      },
    },
    {
      name: "siteDescription",
      type: "textarea",
      label: "Site Description",
      defaultValue: "Making spatial and temporal data analysis accessible to everyone.",
      admin: {
        description: "Meta description for SEO and social sharing (og:description)",
      },
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
