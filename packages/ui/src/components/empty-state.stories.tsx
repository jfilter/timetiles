/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DatabaseZap } from "lucide-react";

import { EmptyState } from "./empty-state";

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  argTypes: { height: { control: "text" }, title: { control: "text" }, description: { control: "text" } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    height: 220,
    title: "No datasets yet",
    description: "Create your first dataset to begin organizing imported event sources.",
  },
};

export const CompactMessage: Story = { args: { title: "No scheduled imports configured" } };

export const CustomIcon: Story = {
  args: {
    height: 220,
    icon: <DatabaseZap className="h-12 w-12" />,
    title: "No preview rows available",
    description: "The uploaded file has not been parsed yet, so there is nothing to display in the preview grid.",
  },
};
