/**
 * Hero block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";

registerBlock({
  slug: "hero",
  labels: { singular: "Hero Section", plural: "Hero Sections" },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    { name: "subtitle", type: "text", localized: true },
    { name: "description", type: "textarea", localized: true },
    {
      name: "background",
      type: "select",
      defaultValue: "gradient",
      options: [
        { label: "Gradient", value: "gradient" },
        { label: "Grid", value: "grid" },
      ],
    },
    {
      name: "buttons",
      type: "array",
      fields: [
        { name: "text", type: "text", required: true, localized: true },
        { name: "link", type: "text", required: true },
        {
          name: "variant",
          type: "select",
          defaultValue: "default",
          options: [
            { label: "Default", value: "default" },
            { label: "Outline", value: "outline" },
          ],
        },
      ],
    },
  ],
});
