/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapPinned } from "lucide-react";

import { ContentState } from "./content-state";

const meta: Meta<typeof ContentState> = {
  title: "Components/ContentState",
  component: ContentState,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["empty", "no-match", "error"] }, height: { control: "text" } },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    variant: "empty",
    height: 220,
    title: "No events imported yet",
    subtitle: "Upload a CSV or spreadsheet to start building your timeline.",
  },
};

export const NoMatch: Story = {
  args: {
    variant: "no-match",
    height: 220,
    title: "No events match the active filters",
    subtitle: "Try widening the date range or removing the neighborhood constraint.",
  },
};

export const ErrorState: Story = {
  args: {
    variant: "error",
    height: 220,
    title: "Unable to load event clusters",
    subtitle: "The map service returned an unexpected response.",
    onRetry: () => {},
  },
};

export const CustomIcon: Story = {
  args: {
    variant: "empty",
    height: 220,
    icon: <MapPinned className="h-12 w-12" />,
    title: "No geocoded venues yet",
    subtitle: "Add latitude and longitude columns or enable geocoding during import.",
  },
};
