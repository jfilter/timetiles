/**
 * Details grid block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";
import { iconOptions } from "./shared";

registerBlock({
  slug: "detailsGrid",
  labels: { singular: "Details Grid Section", plural: "Details Grid Sections" },
  fields: [
    { name: "sectionTitle", type: "text", label: "Section Title (optional)", localized: true },
    {
      name: "variant",
      type: "select",
      defaultValue: "grid-3",
      options: [
        { label: "2 Columns", value: "grid-2" },
        { label: "3 Columns", value: "grid-3" },
        { label: "4 Columns", value: "grid-4" },
        { label: "Compact", value: "compact" },
      ],
    },
    {
      name: "items",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        { name: "icon", type: "select", required: true, options: iconOptions },
        { name: "label", type: "text", required: true, localized: true },
        { name: "value", type: "text", required: true, localized: true },
        { name: "link", type: "text" },
      ],
    },
  ],
});
