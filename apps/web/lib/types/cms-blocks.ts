/**
 * Renderer aliases derived from Payload's generated page schema.
 *
 * @module
 * @category Types
 */
import type { Page } from "@/payload-types";

export type Block = Page["pageBuilder"][number];
export type BlockStyle = NonNullable<Block["blockStyle"]>;

export type HeroBlock = Extract<Block, { blockType: "hero" }>;
export type FeaturesBlock = Extract<Block, { blockType: "features" }>;
export type StatsBlock = Extract<Block, { blockType: "stats" }>;
export type DetailsGridBlock = Extract<Block, { blockType: "detailsGrid" }>;
export type TimelineBlock = Extract<Block, { blockType: "timeline" }>;
export type TestimonialsBlock = Extract<Block, { blockType: "testimonials" }>;
export type RichTextBlock = Extract<Block, { blockType: "richText" }>;
export type CTABlock = Extract<Block, { blockType: "cta" }>;
export type NewsletterFormBlock = Extract<Block, { blockType: "newsletterForm" }>;
export type NewsletterCTABlock = Extract<Block, { blockType: "newsletterCTA" }>;

export interface BlockRendererProps {
  blocks: Page["pageBuilder"];
}
