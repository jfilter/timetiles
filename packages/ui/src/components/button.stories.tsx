/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Mail, Plus } from "lucide-react";

import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "secondary", "outline", "ghost", "destructive", "link"] },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Button" } };

export const Secondary: Story = { args: { children: "Secondary", variant: "secondary" } };

export const Outline: Story = { args: { children: "Outline", variant: "outline" } };

export const Ghost: Story = { args: { children: "Ghost", variant: "ghost" } };

export const Destructive: Story = { args: { children: "Delete", variant: "destructive" } };

export const Link: Story = { args: { children: "Link", variant: "link" } };

export const Small: Story = { args: { children: "Small", size: "sm" } };

export const Large: Story = { args: { children: "Large", size: "lg" } };

export const WithIcon: Story = {
  render: () => (
    <Button>
      <Mail />
      Login with Email
    </Button>
  ),
};

export const IconOnly: Story = { args: { size: "icon", "aria-label": "Add item", children: <Plus /> } };

export const Disabled: Story = { args: { children: "Disabled", disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};
