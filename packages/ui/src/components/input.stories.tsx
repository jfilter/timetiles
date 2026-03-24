/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    type: { control: "select", options: ["text", "email", "password", "number", "search", "url"] },
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { placeholder: "Enter text..." } };

export const Email: Story = { args: { type: "email", placeholder: "name@example.com" } };

export const Password: Story = { args: { type: "password", placeholder: "Enter password" } };

export const Disabled: Story = { args: { placeholder: "Disabled input", disabled: true } };

export const WithValue: Story = { args: { defaultValue: "Berlin, Germany" } };

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-[300px] gap-2">
      <label htmlFor="location" className="text-foreground text-sm font-medium">
        Location
      </label>
      <Input id="location" placeholder="Search for a city..." />
      <p className="text-muted-foreground text-xs">Enter the city where the event takes place.</p>
    </div>
  ),
};
