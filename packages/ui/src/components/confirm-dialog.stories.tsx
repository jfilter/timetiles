/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";

const meta: Meta<typeof ConfirmDialog> = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["default", "destructive"] } },
};

export default meta;
type Story = StoryObj<typeof meta>;

const ConfirmDialogPreview = (args: React.ComponentProps<typeof ConfirmDialog>) => {
  const [open, setOpen] = useState(true);
  return <ConfirmDialog {...args} open={open} onOpenChange={setOpen} onConfirm={() => {}} />;
};

export const Default: Story = {
  args: {
    title: "Publish dataset updates?",
    description: "This will make the reviewed import visible on the public site and through the v1 API.",
    confirmLabel: "Publish now",
    cancelLabel: "Keep draft",
    variant: "default",
  },
  render: (args) => <ConfirmDialogPreview {...args} />,
};

export const Destructive: Story = {
  args: {
    title: "Delete scheduled import?",
    description: "The polling schedule, stored credentials, and run history for this source will be removed.",
    confirmLabel: "Delete import",
    cancelLabel: "Cancel",
    variant: "destructive",
  },
  render: (args) => <ConfirmDialogPreview {...args} />,
};
