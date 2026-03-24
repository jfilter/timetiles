/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { BarChart } from "./bar-chart";

const meta: Meta<typeof BarChart> = {
  title: "Charts/BarChart",
  component: BarChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleData = [
  { label: "Berlin", value: 42 },
  { label: "Munich", value: 28 },
  { label: "Hamburg", value: 19 },
  { label: "Cologne", value: 15 },
  { label: "Frankfurt", value: 11 },
];

export const Default: Story = { args: { data: sampleData, height: 300 } };

export const Loading: Story = { args: { data: [], isInitialLoad: true, height: 300 } };

export const Empty: Story = { args: { data: [], height: 300 } };

export const ErrorState: Story = { args: { data: [], isError: true, height: 300, onRetry: () => {} } };

export const SingleItem: Story = { args: { data: [{ label: "Berlin", value: 100 }], height: 200 } };

export const ManyItems: Story = {
  args: {
    data: [
      { label: "Berlin", value: 142 },
      { label: "Munich", value: 98 },
      { label: "Hamburg", value: 87 },
      { label: "Cologne", value: 76 },
      { label: "Frankfurt", value: 65 },
      { label: "Stuttgart", value: 54 },
      { label: "Düsseldorf", value: 43 },
      { label: "Leipzig", value: 32 },
      { label: "Dortmund", value: 21 },
      { label: "Dresden", value: 15 },
    ],
    height: 400,
  },
};
