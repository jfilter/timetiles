/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  BlueskyIcon,
  BusinessIcon,
  EmailIcon,
  FacebookIcon,
  GitHubIcon,
  InsightsIcon,
  InstagramIcon,
  LinkedInIcon,
  LocationIcon,
  MapIcon,
  MastodonIcon,
  SupportIcon,
  TimelineIcon,
  XIcon,
  YouTubeIcon,
} from ".";

interface IconGalleryProps {
  readonly size?: number;
}

interface IconDefinition {
  readonly name: string;
  readonly usage: string;
  readonly Component: typeof MapIcon;
}

const navigationIcons: IconDefinition[] = [
  { name: "MapIcon", usage: "Explore page and spatial search affordances.", Component: MapIcon },
  { name: "TimelineIcon", usage: "Temporal filtering and chronology views.", Component: TimelineIcon },
  { name: "InsightsIcon", usage: "Analytics, reports, and dataset insights.", Component: InsightsIcon },
  { name: "BusinessIcon", usage: "Catalogs, organizations, and partner profiles.", Component: BusinessIcon },
  { name: "LocationIcon", usage: "Venue chips, address fields, and map callouts.", Component: LocationIcon },
];

const communityIcons: IconDefinition[] = [
  { name: "EmailIcon", usage: "Newsletter signup and contact actions.", Component: EmailIcon },
  { name: "SupportIcon", usage: "Help center and support entry points.", Component: SupportIcon },
  { name: "GitHubIcon", usage: "Repository links and open source references.", Component: GitHubIcon },
  { name: "YouTubeIcon", usage: "Recorded demos and onboarding walkthroughs.", Component: YouTubeIcon },
];

const socialIcons: IconDefinition[] = [
  { name: "BlueskyIcon", usage: "Social profile links in the footer and share surfaces.", Component: BlueskyIcon },
  { name: "XIcon", usage: "Campaign shares and announcements.", Component: XIcon },
  { name: "InstagramIcon", usage: "Visual campaign links and creator profiles.", Component: InstagramIcon },
  { name: "FacebookIcon", usage: "Community pages and event promotion.", Component: FacebookIcon },
  { name: "LinkedInIcon", usage: "Professional updates and partner spotlights.", Component: LinkedInIcon },
  { name: "MastodonIcon", usage: "Federated social presence for civic audiences.", Component: MastodonIcon },
];

const IconGallery = ({ size = 28 }: IconGalleryProps) => (
  <div className="grid max-w-6xl gap-6">
    {[
      { title: "Product and navigation", icons: navigationIcons },
      { title: "Support and communication", icons: communityIcons },
      { title: "Social channels", icons: socialIcons },
    ].map((group) => (
      <section key={group.title} className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">{group.title}</h3>
          <p className="text-muted-foreground text-sm">Grouped reference coverage for the cartographic icon set.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.icons.map(({ name, usage, Component }) => (
            <div key={name} className="bg-card border-border flex items-start gap-4 rounded-lg border p-4 shadow-sm">
              <div className="bg-muted text-foreground flex h-14 w-14 shrink-0 items-center justify-center rounded-md">
                <Component size={size} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-muted-foreground text-sm">{usage}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

const meta: Meta<typeof IconGallery> = {
  title: "Icons/IconGallery",
  component: IconGallery,
  tags: ["autodocs"],
  argTypes: { size: { control: { type: "number", min: 20, max: 64, step: 4 } } },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { size: 28 } };

export const LargeFormat: Story = { args: { size: 44 } };
