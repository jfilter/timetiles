/**
 * Timeline block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";

registerBlock({
  slug: "timeline",
  labels: { singular: "Timeline Section", plural: "Timeline Sections" },
  fields: [
    { name: "sectionTitle", type: "text", label: "Section Title (optional)", localized: true },
    {
      name: "variant",
      type: "select",
      defaultValue: "vertical",
      options: [
        { label: "Vertical", value: "vertical" },
        { label: "Compact", value: "compact" },
      ],
    },
    {
      name: "items",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        {
          name: "date",
          type: "text",
          required: true,
          localized: true,
          admin: { description: "Display date (e.g., '2024', 'March 2024', 'Q1 2024')" },
        },
        { name: "title", type: "text", required: true, localized: true },
        { name: "description", type: "textarea", required: true, localized: true },
      ],
    },
  ],
});
