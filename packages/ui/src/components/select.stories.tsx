/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta: Meta<typeof Select> = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="grid w-[280px] gap-2">
      <Label htmlFor="region-select">Region</Label>
      <Select defaultValue="berlin">
        <SelectTrigger id="region-select">
          <SelectValue placeholder="Choose a region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="berlin">Berlin</SelectItem>
          <SelectItem value="hamburg">Hamburg</SelectItem>
          <SelectItem value="munich">Munich</SelectItem>
          <SelectItem value="cologne">Cologne</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const OpenMenu: Story = {
  render: () => (
    <Select open defaultValue="weekly">
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Choose cadence" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Import cadence</SelectLabel>
          <SelectItem value="hourly">Hourly</SelectItem>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="weekly">Weekly</SelectItem>
          <SelectItem value="monthly">Monthly</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const OutlineAndLarge: Story = {
  render: () => (
    <Select defaultValue="high">
      <SelectTrigger className="w-[320px]" variant="outline" size="lg">
        <SelectValue placeholder="Choose priority" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="low">Low priority</SelectItem>
        <SelectItem value="medium">Medium priority</SelectItem>
        <SelectItem value="high">High priority</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const GroupedOptions: Story = {
  render: () => (
    <Select open defaultValue="geo">
      <SelectTrigger className="w-[320px]">
        <SelectValue placeholder="Choose a panel" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Explore views</SelectLabel>
          <SelectItem value="map">Map</SelectItem>
          <SelectItem value="list">List</SelectItem>
          <SelectItem value="calendar">Calendar</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Analytics</SelectLabel>
          <SelectItem value="geo">Geospatial summary</SelectItem>
          <SelectItem value="timeline">Timeline analysis</SelectItem>
          <SelectItem value="sources">Source health</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select defaultValue="archived">
      <SelectTrigger className="w-[280px]" disabled>
        <SelectValue placeholder="Choose workspace" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active workspace</SelectItem>
        <SelectItem value="archived">Archived workspace</SelectItem>
      </SelectContent>
    </Select>
  ),
};
