/**
 * Features block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";
import { accentOptions, iconOptions } from "./shared";

registerBlock({
  slug: "features",
  labels: { singular: "Features Section", plural: "Features Sections" },
  fields: [
    { name: "sectionTitle", type: "text", label: "Section Title", localized: true },
    { name: "sectionDescription", type: "textarea", label: "Section Description", localized: true },
    {
      name: "columns",
      type: "select",
      defaultValue: "3",
      options: [
        { label: "1 Column", value: "1" },
        { label: "2 Columns", value: "2" },
        { label: "3 Columns", value: "3" },
        { label: "4 Columns", value: "4" },
      ],
    },
    {
      name: "features",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        { name: "icon", type: "select", required: true, options: iconOptions },
        { name: "title", type: "text", required: true, localized: true },
        { name: "description", type: "textarea", required: true, localized: true },
        { name: "accent", type: "select", defaultValue: "none", options: accentOptions },
      ],
    },
  ],
});
