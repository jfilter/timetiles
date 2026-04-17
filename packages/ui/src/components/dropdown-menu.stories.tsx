/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta: Meta<typeof DropdownMenu> = {
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Dataset actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            View details
            <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Duplicate dataset
            <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Export CSV
            <DropdownMenuShortcut>⇧⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const SelectionStates: Story = {
  render: () => (
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button>Open filters</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Visible layers</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Event markers</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Cluster hulls</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Venue labels</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="balanced">
          <DropdownMenuRadioItem value="fine">Fine detail</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="balanced">Balanced</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="coarse">Coarse overview</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const NestedMenu: Story = {
  render: () => (
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open publishing menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Preview changes</DropdownMenuItem>
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>Publish to…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Website catalog</DropdownMenuItem>
            <DropdownMenuItem>Public API</DropdownMenuItem>
            <DropdownMenuItem>Partner feed export</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Archive draft</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
