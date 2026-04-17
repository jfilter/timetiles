/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChartEmptyState } from "./chart-empty-state";

const meta: Meta<typeof ChartEmptyState> = {
  title: "Charts/ChartEmptyState",
  component: ChartEmptyState,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["no-data", "no-match", "error"] },
    message: { control: "text" },
    suggestion: { control: "text" },
  },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "no-data", height: 220 } };

export const NoMatches: Story = {
  args: {
    variant: "no-match",
    height: 220,
    message: "No events match the current timeline filters.",
    suggestion: "Try widening the date range or removing the organizer filter.",
  },
};

export const ErrorState: Story = { args: { variant: "error", height: 220, onRetry: () => {} } };

export const CustomCopy: Story = {
  args: {
    variant: "no-data",
    height: 220,
    message: "This dataset has not been imported yet.",
    suggestion: "Run the scheduled import once to populate the chart preview.",
  },
};
