/**
 * Testimonials block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";
import { iconOptions } from "./shared";

registerBlock({
  slug: "testimonials",
  labels: { singular: "Testimonials Section", plural: "Testimonials Sections" },
  fields: [
    { name: "sectionTitle", type: "text", label: "Section Title (optional)", localized: true },
    {
      name: "variant",
      type: "select",
      defaultValue: "grid",
      options: [
        { label: "Grid", value: "grid" },
        { label: "Single", value: "single" },
        { label: "Masonry", value: "masonry" },
      ],
    },
    {
      name: "items",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        { name: "quote", type: "textarea", required: true, localized: true },
        { name: "author", type: "text", required: true, localized: true },
        {
          name: "role",
          type: "text",
          localized: true,
          admin: { description: "Optional role or title (e.g., 'Open Source Contributor')" },
        },
        {
          name: "avatar",
          type: "select",
          options: iconOptions,
          admin: { description: "Optional icon to display as avatar" },
        },
      ],
    },
  ],
});
