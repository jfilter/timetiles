/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarRange, Database, Filter, Globe2, MapPinned, Search } from "lucide-react";

import {
  Feature,
  FeatureDescription,
  FeatureIcon,
  Features,
  FeaturesDescription,
  FeaturesGrid,
  FeaturesHeader,
  FeaturesTitle,
  FeatureTitle,
} from "./features";

const meta: Meta<typeof Features> = {
  title: "Layout/Features",
  component: Features,
  tags: ["autodocs"],
  argTypes: { layout: { control: "select", options: ["grid", "list", "cards"] } },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const datasetFeatures = [
  {
    title: "Map-first discovery",
    description: "Cluster events across dense city centers or sparse regional archives without leaving the same page.",
    accent: "primary" as const,
    icon: <MapPinned className="size-14" />,
  },
  {
    title: "Import pipeline review",
    description: "Approve schema matches, inspect transformed rows, and retry failed jobs with clear progress states.",
    accent: "secondary" as const,
    icon: <Database className="size-14" />,
  },
  {
    title: "Temporal analysis",
    description: "Filter by decades, seasons, or single campaigns using interactive timeline and histogram controls.",
    accent: "accent" as const,
    icon: <CalendarRange className="size-14" />,
  },
];

const editorFeatures = [
  {
    title: "Search across locations",
    description: "Find related places, venues, and datasets from one indexed catalog view.",
    accent: "primary" as const,
    icon: <Search className="size-14" />,
  },
  {
    title: "Shared filtering",
    description: "Keep map, results, and exports aligned around the same canonical filter model.",
    accent: "muted" as const,
    icon: <Filter className="size-14" />,
  },
  {
    title: "Theme-aware embeds",
    description: "Drop visualizations into public pages while matching the surrounding brand system.",
    accent: "accent" as const,
    icon: <Globe2 className="size-14" />,
  },
];

export const Default: Story = {
  render: (args) => (
    <Features {...args}>
      <FeaturesHeader>
        <FeaturesTitle>Everything a spatial editorial workflow needs to stay in one place.</FeaturesTitle>
        <FeaturesDescription>
          TimeTiles combines ingestion, mapping, and storytelling primitives so teams can publish trustworthy event data
          without bolting together separate admin tools.
        </FeaturesDescription>
      </FeaturesHeader>
      <FeaturesGrid columns={3}>
        {datasetFeatures.map((feature) => (
          <Feature key={feature.title} accent={feature.accent}>
            <FeatureIcon>{feature.icon}</FeatureIcon>
            <FeatureTitle>{feature.title}</FeatureTitle>
            <FeatureDescription>{feature.description}</FeatureDescription>
          </Feature>
        ))}
      </FeaturesGrid>
    </Features>
  ),
};

export const List: Story = {
  args: { layout: "list" },
  render: (args) => (
    <Features {...args}>
      <FeaturesHeader>
        <FeaturesTitle>Support teams can walk through the whole publishing flow with confidence.</FeaturesTitle>
        <FeaturesDescription>
          A single-column composition is useful when you want each capability explained in a little more detail.
        </FeaturesDescription>
      </FeaturesHeader>
      <FeaturesGrid columns={1} className="mx-auto max-w-4xl">
        {editorFeatures.map((feature) => (
          <Feature key={feature.title} accent={feature.accent}>
            <FeatureIcon>{feature.icon}</FeatureIcon>
            <FeatureTitle>{feature.title}</FeatureTitle>
            <FeatureDescription>{feature.description}</FeatureDescription>
          </Feature>
        ))}
      </FeaturesGrid>
    </Features>
  ),
};

export const Cards: Story = {
  args: { layout: "cards" },
  render: (args) => (
    <Features {...args}>
      <FeaturesHeader>
        <FeaturesTitle>Build a polished launch page with curated feature cards.</FeaturesTitle>
        <FeaturesDescription>
          The card treatment works well for product highlights, onboarding paths, and public design-system examples.
        </FeaturesDescription>
      </FeaturesHeader>
      <FeaturesGrid columns={4}>
        {[...datasetFeatures, ...editorFeatures.slice(0, 1)].map((feature) => (
          <Feature key={feature.title} accent={feature.accent}>
            <FeatureIcon>{feature.icon}</FeatureIcon>
            <FeatureTitle>{feature.title}</FeatureTitle>
            <FeatureDescription>{feature.description}</FeatureDescription>
          </Feature>
        ))}
      </FeaturesGrid>
    </Features>
  ),
};
