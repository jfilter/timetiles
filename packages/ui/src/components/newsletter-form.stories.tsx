/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { NewsletterForm } from "./newsletter-form";

const newsletterMessages = {
  success: "You’re on the map. Weekly updates will arrive in your inbox.",
  error: "A submission handler is required for newsletter signup.",
  networkError: "We couldn’t reach the subscription service. Please try again in a moment.",
};

const meta: Meta<typeof NewsletterForm> = {
  title: "Components/NewsletterForm",
  component: NewsletterForm,
  tags: ["autodocs"],
  argTypes: { headline: { control: "text" }, placeholder: { control: "text" }, buttonText: { control: "text" } },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { messages: newsletterMessages, onSubmit: async () => {} } };

export const EditorialCopy: Story = {
  args: {
    headline: "Plot New Discoveries",
    placeholder: "editor@citydesk.example",
    buttonText: "Join the editorial briefing",
    buttonLabels: { submitting: "Plotting subscription…", submitted: "Briefing queued" },
    messages: newsletterMessages,
    onSubmit: async () => {},
  },
};

export const EmbeddedInSidebar: Story = {
  render: () => (
    <div className="bg-card w-[360px] rounded-sm border p-4">
      <NewsletterForm
        headline="Stay ahead of source changes"
        placeholder="name@example.com"
        buttonText="Email me updates"
        messages={newsletterMessages}
        onSubmit={async () => {}}
      />
    </div>
  ),
};
