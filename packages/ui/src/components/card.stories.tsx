/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardLabel,
  CardSpec,
  CardSpecItem,
  CardTitle,
  CardVersion,
} from "./card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "elevated", "outline", "ghost", "showcase"] },
    padding: { control: "select", options: ["none", "sm", "default", "lg"] },
  },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-[380px]">
      <CardHeader>
        <CardTitle>Event Dataset</CardTitle>
        <CardDescription>A collection of community events across Berlin.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">42 events imported from CSV on March 12, 2026.</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          View Events
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Elevated: Story = {
  render: () => (
    <Card variant="elevated" className="w-[380px]">
      <CardHeader>
        <CardTitle>Elevated Card</CardTitle>
        <CardDescription>Hover to see the lift effect.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">This card has a shadow and hover animation.</p>
      </CardContent>
    </Card>
  ),
};

export const Showcase: Story = {
  render: () => (
    <Card variant="showcase" className="w-[380px]">
      <CardHeader>
        <CardVersion>v2.0</CardVersion>
        <CardTitle>Showcase Card</CardTitle>
        <CardDescription>With version badge and spec grid.</CardDescription>
      </CardHeader>
      <CardContent>
        <CardLabel>Specifications</CardLabel>
        <CardSpec>
          <CardSpecItem label="Format">CSV</CardSpecItem>
          <CardSpecItem label="Events">1,247</CardSpecItem>
          <CardSpecItem label="Coverage">Berlin</CardSpecItem>
          <CardSpecItem label="Updated">Daily</CardSpecItem>
        </CardSpec>
      </CardContent>
    </Card>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      {(["default", "elevated", "outline", "ghost", "showcase"] as const).map((variant) => (
        <Card key={variant} variant={variant} className="w-[280px]">
          <CardHeader>
            <CardTitle className="text-lg">{variant}</CardTitle>
            <CardDescription>Card variant preview</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  ),
};
