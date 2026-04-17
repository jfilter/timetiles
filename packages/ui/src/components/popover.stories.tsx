/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta: Meta<typeof Popover> = {
  title: "Components/Popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="outline">Open details</Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-3">
        <h3 className="font-serif text-lg font-semibold">Dataset summary</h3>
        <p className="text-muted-foreground text-sm">
          The current feed contains 1,247 events across 12 Berlin neighborhoods and refreshes every weekday morning.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

export const StartAligned: Story = {
  render: () => (
    <Popover open>
      <PopoverTrigger asChild>
        <Button>Source health</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-3">
        <h3 className="font-serif text-lg font-semibold">Last successful fetch</h3>
        <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
          <li>Fetched 08:15 UTC</li>
          <li>Schema unchanged</li>
          <li>37 rows updated</li>
        </ul>
      </PopoverContent>
    </Popover>
  ),
};
