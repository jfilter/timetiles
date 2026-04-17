/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Label> = {
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["default", "muted", "error"] } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Dataset title" } };

export const Muted: Story = { args: { variant: "muted", children: "Optional field" } };

export const ErrorVariant: Story = { args: { variant: "error", children: "Location is required" } };

export const WithInput: Story = {
  render: () => (
    <div className="grid w-[340px] gap-2">
      <Label htmlFor="catalog-name">Catalog name</Label>
      <Input id="catalog-name" defaultValue="Berlin Civic Data" />
      <p className="text-muted-foreground text-sm">This label stays paired with the control for accessible forms.</p>
    </div>
  ),
};

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-start gap-3">
      <Checkbox id="publish-catalog" defaultChecked />
      <div className="grid gap-1.5">
        <Label htmlFor="publish-catalog">Publish this catalog after import</Label>
        <Label variant="muted">Search engines and public API consumers will be able to discover it.</Label>
      </div>
    </div>
  ),
};
