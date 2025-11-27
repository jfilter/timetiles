/**
 * Defines the Payload CMS global configuration for the Main Menu.
 *
 * Globals in Payload are used for managing site-wide settings that don't belong to a specific
 * collection. This configuration defines the structure of the main navigation menu, allowing
 * administrators to manage the navigation links (label and URL) that appear across the site.
 *
 * @module
 */
import type { GlobalConfig } from "payload";

export const MainMenu: GlobalConfig = {
  slug: "main-menu",
  admin: {
    group: "Content",
  },
  versions: {
    drafts: {
      autosave: true,
    },
    max: 0, // Keep all versions
  },
  access: {
    read: () => true,
    update: ({ req: { user } }) => user?.role === "admin" || user?.role === "editor",
  },
  fields: [
    {
      name: "navItems",
      type: "array",
      maxRows: 6,
      fields: [
        {
          name: "label",
          type: "text",
          required: true,
        },
        {
          name: "url",
          type: "text",
          required: true,
        },
      ],
    },
  ],
};
