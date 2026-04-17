/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { ErrorMessage } from "./error-message";

const meta: Meta<typeof ErrorMessage> = {
  title: "Components/ErrorMessage",
  component: ErrorMessage,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["inline", "box"] } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = { args: { message: "A dataset name is required before you can continue." } };

export const Box: Story = {
  args: { variant: "box", message: "We couldn’t fetch the latest scheduled import status." },
};

export const WithRetry: Story = {
  args: {
    variant: "box",
    message: "The geocoding provider timed out while validating your API key.",
    onRetry: () => {},
  },
};
