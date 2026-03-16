/**
 * Stats block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";
import { iconOptions } from "./shared";

registerBlock({
  slug: "stats",
  labels: { singular: "Stats Section", plural: "Stats Sections" },
  fields: [
    {
      name: "stats",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        { name: "value", type: "text", required: true, localized: true },
        { name: "label", type: "text", required: true, localized: true },
        { name: "icon", type: "select", options: iconOptions },
      ],
    },
  ],
});
