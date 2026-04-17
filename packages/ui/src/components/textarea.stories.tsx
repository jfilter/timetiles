/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  argTypes: { disabled: { control: "boolean" }, placeholder: { control: "text" } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Add context about the dataset source, update cadence, and any caveats reviewers should know." },
};

export const WithValue: Story = {
  args: {
    defaultValue:
      "This feed aggregates neighborhood events from Berlin district cultural calendars. Records are refreshed every weekday at 05:00 UTC.",
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Notes are locked while the import job is processing." },
};

export const WithFieldContext: Story = {
  render: () => (
    <div className="grid w-[420px] gap-2">
      <Label htmlFor="review-notes">Review notes</Label>
      <Textarea
        id="review-notes"
        defaultValue="Flagged three venues that need manual geocoding because the address only contains neighborhood names."
      />
      <p className="text-muted-foreground text-sm">Use this space to leave handoff notes for the next editor.</p>
    </div>
  ),
};
