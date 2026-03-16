/**
 * Shared block style fields for per-block visual customization.
 *
 * These fields are automatically appended to every block registered
 * in the block registry, providing consistent styling controls across
 * all block types.
 *
 * @module
 * @category Blocks
 */
import type { Field } from "payload";

/** Block-level style control fields shared by all blocks. */
export const blockStyleFields: Field = {
  name: "blockStyle",
  type: "group",
  label: "Block Style",
  admin: { description: "Visual styling overrides for this block instance", condition: () => true },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "paddingTop",
          type: "select",
          dbName: "pt",
          admin: { description: "Top padding", width: "50%" },
          options: [
            { label: "None", value: "none" },
            { label: "Small", value: "sm" },
            { label: "Medium", value: "md" },
            { label: "Large", value: "lg" },
            { label: "Extra Large", value: "xl" },
          ],
        },
        {
          name: "paddingBottom",
          type: "select",
          dbName: "pb",
          admin: { description: "Bottom padding", width: "50%" },
          options: [
            { label: "None", value: "none" },
            { label: "Small", value: "sm" },
            { label: "Medium", value: "md" },
            { label: "Large", value: "lg" },
            { label: "Extra Large", value: "xl" },
          ],
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "maxWidth",
          type: "select",
          dbName: "mw",
          admin: { description: "Maximum content width", width: "50%" },
          options: [
            { label: "Small (768px)", value: "sm" },
            { label: "Medium (1024px)", value: "md" },
            { label: "Large (1152px)", value: "lg" },
            { label: "Extra Large (1280px)", value: "xl" },
            { label: "Full Width", value: "full" },
          ],
        },
        {
          name: "separator",
          type: "select",
          dbName: "sep",
          admin: { description: "Bottom separator style", width: "50%" },
          options: [
            { label: "None", value: "none" },
            { label: "Line", value: "line" },
            { label: "Gradient Fade", value: "gradient" },
            { label: "Wave", value: "wave" },
          ],
        },
      ],
    },
    {
      name: "backgroundColor",
      type: "text",
      admin: { description: "Background color (CSS value, e.g., #f5f5f5 or oklch(0.96 0.01 80))" },
    },
    { name: "anchorId", type: "text", admin: { description: "HTML anchor ID for scroll-to links (e.g., 'features')" } },
    {
      type: "row",
      fields: [
        {
          name: "hideOnMobile",
          type: "checkbox",
          defaultValue: false,
          admin: { description: "Hide on mobile devices", width: "50%" },
        },
        {
          name: "hideOnDesktop",
          type: "checkbox",
          defaultValue: false,
          admin: { description: "Hide on desktop devices", width: "50%" },
        },
      ],
    },
  ],
};
