/**
 * Newsletter form (compact) block definition for the page builder.
 *
 * @module
 * @category Blocks
 */
import { registerBlock } from "./registry";

registerBlock({
  slug: "newsletterForm",
  labels: { singular: "Newsletter Form (Compact)", plural: "Newsletter Forms (Compact)" },
  fields: [
    {
      name: "headline",
      type: "text",
      localized: true,
      defaultValue: "Stay Mapped In",
      admin: { description: "Optional headline text (default: 'Stay Mapped In')" },
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
      defaultValue: "Subscribe",
      admin: { description: "Submit button text" },
    },
  ],
});
