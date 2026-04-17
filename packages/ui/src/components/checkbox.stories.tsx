/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "./checkbox";
import { Label } from "./label";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  argTypes: { disabled: { control: "boolean" }, defaultChecked: { control: "boolean" } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { id: "newsletter-opt-in" },
  render: (args) => (
    <div className="flex items-start gap-3">
      <Checkbox {...args} />
      <div className="grid gap-1.5">
        <Label htmlFor="newsletter-opt-in">Send me the weekly event digest</Label>
        <p className="text-muted-foreground text-sm">Get new datasets, featured maps, and notable community events.</p>
      </div>
    </div>
  ),
};

export const Checked: Story = {
  args: { id: "dataset-alerts", defaultChecked: true },
  render: (args) => (
    <div className="flex items-start gap-3">
      <Checkbox {...args} />
      <div className="grid gap-1.5">
        <Label htmlFor="dataset-alerts">Notify me when this dataset refreshes</Label>
        <p className="text-muted-foreground text-sm">Ideal for scheduled imports that update daily.</p>
      </div>
    </div>
  ),
};

export const Disabled: Story = {
  args: { id: "disabled-preference", disabled: true, defaultChecked: true },
  render: (args) => (
    <div className="flex items-start gap-3">
      <Checkbox {...args} />
      <div className="grid gap-1.5">
        <Label htmlFor="disabled-preference">Archived workspace notifications</Label>
        <p className="text-muted-foreground text-sm">This setting is locked because the workspace is read-only.</p>
      </div>
    </div>
  ),
};

export const Checklist: Story = {
  render: () => (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <Checkbox id="upload-step" defaultChecked />
        <div className="grid gap-1.5">
          <Label htmlFor="upload-step">Upload complete</Label>
          <p className="text-muted-foreground text-sm">CSV validated and ready for schema detection.</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="geocode-step" defaultChecked />
        <div className="grid gap-1.5">
          <Label htmlFor="geocode-step">Geocoding enabled</Label>
          <p className="text-muted-foreground text-sm">Venue addresses will be normalized before publishing.</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="approval-step" />
        <div className="grid gap-1.5">
          <Label htmlFor="approval-step">Require editor approval</Label>
          <p className="text-muted-foreground text-sm">
            Pause imports after validation so a reviewer can inspect the mapping.
          </p>
        </div>
      </div>
    </div>
  ),
};
