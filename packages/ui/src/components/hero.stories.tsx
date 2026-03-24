/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { Hero, HeroAccent, HeroActions, HeroDescription, HeroHeadline, HeroSubheadline } from "./hero";

const meta: Meta<typeof Hero> = {
  title: "Layout/Hero",
  component: Hero,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["centered", "split", "full-bleed"] },
    size: { control: "select", options: ["sm", "default", "lg"] },
    background: { control: "select", options: ["grid", "solid", "none"] },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Map Your World</HeroHeadline>
      <HeroSubheadline>Import, geocode, and visualize events on interactive maps.</HeroSubheadline>
      <HeroActions>
        <Button size="lg">Get Started</Button>
        <Button variant="outline" size="lg">
          Learn More
        </Button>
      </HeroActions>
      <HeroAccent />
    </Hero>
  ),
};

export const Split: Story = {
  args: { variant: "split" },
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Discover Events Near You</HeroHeadline>
      <HeroSubheadline>Browse community events on an interactive map with powerful filtering.</HeroSubheadline>
      <HeroActions>
        <Button size="lg">Explore Map</Button>
      </HeroActions>
    </Hero>
  ),
};

export const FullBleed: Story = {
  args: { variant: "full-bleed" },
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Map Your World</HeroHeadline>
      <HeroSubheadline>Full-screen hero that fills the entire viewport.</HeroSubheadline>
      <HeroActions>
        <Button size="lg">Get Started</Button>
      </HeroActions>
      <HeroAccent />
    </Hero>
  ),
};

export const Small: Story = {
  args: { size: "sm", background: "none" },
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Datasets</HeroHeadline>
      <HeroDescription>Browse and manage your imported event collections.</HeroDescription>
    </Hero>
  ),
};

export const WithDescription: Story = {
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Open Source</HeroHeadline>
      <HeroSubheadline>Community-driven geospatial event management.</HeroSubheadline>
      <HeroDescription>
        TimeTiles is free and open source software. Import events from CSV files, geocode locations, and display them on
        beautiful interactive maps.
      </HeroDescription>
      <HeroActions>
        <Button size="lg">View on GitHub</Button>
      </HeroActions>
    </Hero>
  ),
};

export const SolidBackground: Story = {
  args: { background: "solid" },
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Solid Background</HeroHeadline>
      <HeroSubheadline>Background color without the grid texture pattern.</HeroSubheadline>
    </Hero>
  ),
};

export const TransparentBackground: Story = {
  args: { background: "none" },
  render: (args) => (
    <Hero {...args}>
      <HeroHeadline>Transparent</HeroHeadline>
      <HeroSubheadline>No background — blends into whatever is behind it.</HeroSubheadline>
    </Hero>
  ),
};
