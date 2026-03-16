/**
 * CMS block type definitions for Payload CMS page blocks.
 *
 * Types used by the block renderer to map CMS content to React components.
 *
 * @module
 * @category Types
 */

/** Style controls available on every page builder block. */
export interface BlockStyle {
  paddingTop?: "none" | "sm" | "md" | "lg" | "xl" | null;
  paddingBottom?: "none" | "sm" | "md" | "lg" | "xl" | null;
  backgroundColor?: string | null;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full" | null;
  anchorId?: string | null;
  hideOnMobile?: boolean | null;
  hideOnDesktop?: boolean | null;
  separator?: "none" | "line" | "gradient" | "wave" | null;
}

export interface HeroBlock {
  blockType: "hero";
  title: string;
  subtitle?: string | null;
  description?: string | null;
  background?: "gradient" | "grid" | null;
  buttons?: Array<{ text: string; link: string; variant?: "default" | "outline" | null; id?: string | null }> | null;
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  accent?: "primary" | "secondary" | "accent" | "muted" | "none" | null;
  id?: string | null;
}

export interface FeaturesBlock {
  blockType: "features";
  sectionTitle?: string | null;
  sectionDescription?: string | null;
  features: FeatureItem[];
  columns?: "1" | "2" | "3" | "4" | null;
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface StatItem {
  value: string;
  label: string;
  icon?: string | null;
  id?: string | null;
}

export interface StatsBlock {
  blockType: "stats";
  stats: StatItem[];
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface DetailsGridItem {
  icon: string;
  label: string;
  value: string;
  link?: string | null;
  id?: string | null;
}

export interface DetailsGridBlock {
  blockType: "detailsGrid";
  sectionTitle?: string | null;
  variant?: "grid-2" | "grid-3" | "grid-4" | "compact" | null;
  items: DetailsGridItem[];
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface TimelineBlockItem {
  date: string;
  title: string;
  description: string;
  id?: string | null;
}

export interface TimelineBlock {
  blockType: "timeline";
  sectionTitle?: string | null;
  variant?: "vertical" | "compact" | null;
  items: TimelineBlockItem[];
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface TestimonialItem {
  quote: string;
  author: string;
  role?: string | null;
  avatar?: string | null;
  id?: string | null;
}

export interface TestimonialsBlock {
  blockType: "testimonials";
  sectionTitle?: string | null;
  variant?: "grid" | "single" | "masonry" | null;
  items: TestimonialItem[];
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface RichTextBlock {
  blockType: "richText";
  content: unknown;
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface CTABlock {
  blockType: "cta";
  headline: string;
  description?: string | null;
  buttonText: string;
  buttonLink: string;
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface NewsletterFormBlock {
  blockType: "newsletterForm";
  headline?: string | null;
  placeholder?: string | null;
  buttonText?: string | null;
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export interface NewsletterCTABlock {
  blockType: "newsletterCTA";
  headline?: string | null;
  description?: string | null;
  placeholder?: string | null;
  buttonText?: string | null;
  variant?: "default" | "elevated" | "centered" | null;
  size?: "default" | "lg" | "xl" | null;
  blockStyle?: BlockStyle | null;
  id?: string | null;
  blockName?: string | null;
}

export type Block =
  | HeroBlock
  | FeaturesBlock
  | StatsBlock
  | DetailsGridBlock
  | TimelineBlock
  | TestimonialsBlock
  | RichTextBlock
  | CTABlock
  | NewsletterFormBlock
  | NewsletterCTABlock;

export interface BlockRendererProps {
  blocks: Block[];
}
