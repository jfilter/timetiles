/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";

import { Timeline, TimelineDate, TimelineDescription, TimelineItem, TimelineTitle } from "./timeline";

const meta: Meta<typeof Timeline> = {
  title: "Layout/Timeline",
  component: Timeline,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["vertical", "compact"] } },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const roadmapItems = [
  {
    date: "Q1",
    title: "Pilot ingest workspace",
    description:
      "Define source catalogs, upload the first community calendar feeds, and confirm that schema detection maps cleanly onto editorial expectations.",
  },
  {
    date: "Q2",
    title: "Geocoding review loop",
    description:
      "Add provider selection, cache visibility, and manual correction workflows so location quality can be reviewed before publishing.",
  },
  {
    date: "Q3",
    title: "Public atlas launch",
    description:
      "Ship shareable event pages, map clustering, and temporal exploration so readers can browse current and historical activity together.",
  },
  {
    date: "Q4",
    title: "Recurring import automation",
    description:
      "Schedule upstream feeds, track failed jobs, and expose audit logs so long-running datasets stay trustworthy with minimal operator effort.",
  },
];

const renderTimeline = (args: ComponentProps<typeof Timeline>, itemCount = 4) => (
  <Timeline {...args}>
    {roadmapItems.slice(0, itemCount).map((item, index) => (
      <TimelineItem key={item.title} index={index}>
        <TimelineDate>{item.date}</TimelineDate>
        <TimelineTitle>{item.title}</TimelineTitle>
        <TimelineDescription>{item.description}</TimelineDescription>
      </TimelineItem>
    ))}
  </Timeline>
);

export const Default: Story = { render: (args) => renderTimeline(args) };

export const Compact: Story = { args: { variant: "compact" }, render: (args) => renderTimeline(args, 3) };
