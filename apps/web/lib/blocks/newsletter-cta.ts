/**
 * Newsletter CTA (large) block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";

registerBlock({
  slug: "newsletterCTA",
  labels: { singular: "Newsletter CTA (Large)", plural: "Newsletter CTAs (Large)" },
  fields: [
    {
      name: "headline",
      type: "text",
      localized: true,
      defaultValue: "Never Miss a Discovery",
      admin: { description: "Main headline text" },
    },
    {
      name: "description",
      type: "textarea",
      localized: true,
      defaultValue:
        "Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.",
      admin: { description: "Supporting description text" },
    },
    {
      name: "placeholder",
      type: "text",
      localized: true,
      defaultValue: "your@email.address",
      admin: { description: "Email input placeholder text" },
    },
    {
      name: "buttonText",
      type: "text",
      localized: true,
      defaultValue: "Subscribe to Updates",
      admin: { description: "Submit button text" },
    },
    {
      name: "variant",
      type: "select",
      defaultValue: "default",
      options: [
        { label: "Default (Gradient)", value: "default" },
        { label: "Elevated (Card)", value: "elevated" },
        { label: "Centered (Minimal)", value: "centered" },
      ],
    },
    {
      name: "size",
      type: "select",
      defaultValue: "default",
      options: [
        { label: "Default", value: "default" },
        { label: "Large", value: "lg" },
        { label: "Extra Large", value: "xl" },
      ],
    },
  ],
});
