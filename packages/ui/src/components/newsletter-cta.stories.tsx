/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { NewsletterCTA } from "./newsletter-cta";

const newsletterMessages = {
  success: "Subscription confirmed. The next curated roundup is headed your way.",
  error: "A subscription handler is required for this CTA.",
  networkError: "The signup service is unavailable right now. Please try again shortly.",
};

const meta: Meta<typeof NewsletterCTA> = {
  title: "Layout/NewsletterCTA",
  component: NewsletterCTA,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "elevated", "centered"] },
    size: { control: "select", options: ["default", "lg", "xl"] },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { messages: newsletterMessages, onSubmit: async () => {} } };

export const Elevated: Story = {
  args: {
    variant: "elevated",
    headline: "Get the cartographic briefing",
    description:
      "Receive a concise weekly note with standout event sources, dataset changes, and map-ready stories worth publishing.",
    buttonText: "Subscribe to the briefing",
    messages: newsletterMessages,
    onSubmit: async () => {},
  },
};

export const Centered: Story = {
  args: {
    variant: "centered",
    size: "lg",
    headline: "Follow the next wave of local data",
    description:
      "From neighborhood festivals to civic hearings, stay current with newly mapped events and the feeds that power them.",
    privacyNote: "One thoughtful update each week. No noise, and you can unsubscribe anytime.",
    messages: newsletterMessages,
    onSubmit: async () => {},
  },
};

export const ExtraLarge: Story = {
  args: {
    size: "xl",
    headline: "Build an audience around living event data",
    description:
      "Invite editors, researchers, and community partners into a shared digest of new imports, fresh map views, and publishing-ready highlights.",
    buttonText: "Start receiving updates",
    buttonLabels: { submitting: "Submitting coordinates…", submitted: "Mapped in" },
    messages: newsletterMessages,
    onSubmit: async () => {},
  },
};
