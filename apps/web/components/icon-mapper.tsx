/**
 * Icon Mapper Component
 *
 * Maps icon names from Payload CMS to React icon components.
 * Allows CMS editors to select icons by name without needing
 * to understand React component imports.
 *
 * @module
 * @category Components
 */
import type { IconProps } from "@workspace/ui/icons";
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
} from "@workspace/ui/icons";
import React from "react";

const iconMap = {
  email: EmailIcon,
  business: BusinessIcon,
  support: SupportIcon,
  location: LocationIcon,
  map: MapIcon,
  timeline: TimelineIcon,
  insights: InsightsIcon,
  x: XIcon,
  bluesky: BlueskyIcon,
  mastodon: MastodonIcon,
  github: GitHubIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
} as const;

export type IconName = keyof typeof iconMap;

interface IconMapperProps extends Omit<IconProps, "ref"> {
  name: string;
}

export const IconMapper: React.FC<IconMapperProps> = ({ name, ...props }) => {
  const Icon = iconMap[name as IconName];

  if (!Icon) {
    return null;
  }

  return <Icon {...props} />;
};
