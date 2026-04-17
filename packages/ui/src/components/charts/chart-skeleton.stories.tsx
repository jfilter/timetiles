/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChartSkeleton } from "./chart-skeleton";

const meta: Meta<typeof ChartSkeleton> = {
  title: "Charts/ChartSkeleton",
  component: ChartSkeleton,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["histogram", "bar", "scatter"] },
    height: { control: { type: "number", min: 160, max: 360, step: 20 } },
  },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "histogram", height: 220 } };

export const BarChart: Story = { args: { variant: "bar", height: 240 } };

export const ScatterPlot: Story = { args: { variant: "scatter", height: 240 } };

export const TallHistogram: Story = { args: { variant: "histogram", height: 320 } };
