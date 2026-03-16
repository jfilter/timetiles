/**
 * Call to action block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";

registerBlock({
  slug: "cta",
  labels: { singular: "Call to Action", plural: "Call to Action Blocks" },
  fields: [
    { name: "headline", type: "text", required: true, localized: true },
    { name: "description", type: "textarea", localized: true },
    { name: "buttonText", type: "text", required: true, localized: true },
    { name: "buttonLink", type: "text", required: true },
  ],
});
