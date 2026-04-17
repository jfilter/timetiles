/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { LoadingState } from "./loading-state";

const meta: Meta<typeof LoadingState> = {
  title: "Components/LoadingState",
  component: LoadingState,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["spinner", "overlay", "text", "skeleton"] },
    height: { control: "text" },
    message: { control: "text" },
  },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Spinner: Story = { args: { variant: "spinner", height: 220, message: "Geocoding venue addresses…" } };

export const TextOnly: Story = { args: { variant: "text", height: 120, message: "Saving field mapping…" } };

export const Skeleton: Story = { args: { variant: "skeleton", height: 220 } };

export const Overlay: Story = {
  render: () => (
    <div className="relative w-[420px]">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Import Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted h-4 rounded" />
          <div className="bg-muted h-4 w-5/6 rounded" />
          <div className="bg-muted h-4 w-2/3 rounded" />
        </CardContent>
      </Card>
      <LoadingState variant="overlay" message="Refreshing run history…" />
    </div>
  ),
};
