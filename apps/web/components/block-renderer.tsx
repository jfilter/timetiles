/* oxlint-disable nextjs/no-html-link-for-pages -- CMS content links may be external */
/**
 * Block Renderer Component
 *
 * Renders Payload CMS page blocks as React UI components.
 * Supports various block types: Hero, Features, Stats, ContactMethods, RichText, CTA.
 * This is similar to Wagtail's StreamField rendering.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Button,
  DetailsGrid,
  DetailsIcon,
  DetailsItem,
  DetailsLabel,
  DetailsValue,
  Feature,
  FeatureDescription,
  FeatureIcon,
  Features,
  FeaturesDescription,
  FeaturesGrid,
  FeaturesHeader,
  FeaturesTitle,
  FeatureTitle,
  Hero,
  HeroActions,
  HeroHeadline,
  HeroSubheadline,
  NewsletterCTA,
  NewsletterForm,
  TestimonialAuthor,
  TestimonialAvatar,
  TestimonialCard,
  TestimonialMeta,
  TestimonialQuote,
  Testimonials,
  Timeline,
  TimelineDate,
  TimelineDescription,
  TimelineItem,
  TimelineTitle,
} from "@timetiles/ui";
import React from "react";

import type {
  Block,
  BlockRendererProps,
  CTABlock,
  DetailsGridBlock,
  FeaturesBlock,
  HeroBlock,
  NewsletterCTABlock,
  NewsletterFormBlock,
  RichTextBlock,
  StatsBlock,
  TestimonialsBlock,
  TimelineBlock,
} from "@/lib/types/cms-blocks";

import { IconMapper } from "./icon-mapper";
import { RichText } from "./layout/rich-text";

const newsletterSubmit = async (email: string, additionalData?: Record<string, unknown>) => {
  const res = await fetch("/api/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...additionalData }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Subscription failed.");
  }
};

const renderHero = (block: HeroBlock, key: string) => {
  const heroBackground = block.background === "gradient" ? "grid" : (block.background ?? "grid");
  return (
    <Hero key={key} background={heroBackground}>
      <HeroHeadline>{block.title}</HeroHeadline>
      {block.subtitle && <HeroSubheadline>{block.subtitle}</HeroSubheadline>}
      {block.description && <p className="text-muted-foreground mt-4 text-center text-lg">{block.description}</p>}
      {block.buttons && block.buttons.length > 0 && (
        <HeroActions>
          {block.buttons.map((button, btnIndex) => (
            <Button key={button.id ?? `btn-${btnIndex}`} asChild variant={button.variant ?? "default"}>
              <a href={button.link}>{button.text}</a>
            </Button>
          ))}
        </HeroActions>
      )}
    </Hero>
  );
};

const renderFeatures = (block: FeaturesBlock, key: string) => {
  const columnCount = (block.columns ? Number.parseInt(block.columns, 10) : 3) as 1 | 2 | 3 | 4;
  return (
    <Features key={key}>
      {(block.sectionTitle ?? block.sectionDescription) && (
        <FeaturesHeader>
          {block.sectionTitle && <FeaturesTitle>{block.sectionTitle}</FeaturesTitle>}
          {block.sectionDescription && <FeaturesDescription>{block.sectionDescription}</FeaturesDescription>}
        </FeaturesHeader>
      )}
      <FeaturesGrid columns={columnCount}>
        {block.features.map((feature, featureIndex) => (
          <Feature key={feature.id ?? `feature-${featureIndex}`} accent={feature.accent ?? "none"}>
            <FeatureIcon>
              <IconMapper name={feature.icon} size={64} />
            </FeatureIcon>
            <FeatureTitle>{feature.title}</FeatureTitle>
            <FeatureDescription>{feature.description}</FeatureDescription>
          </Feature>
        ))}
      </FeaturesGrid>
    </Features>
  );
};

const renderStats = (block: StatsBlock, key: string) => (
  <div key={key} className="bg-muted/30 py-16">
    <div className="container mx-auto max-w-6xl px-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {block.stats.map((stat, statIndex) => (
          <div key={stat.id ?? `stat-${statIndex}`} className="text-center">
            {stat.icon && (
              <div className="text-primary mb-4 flex justify-center">
                <IconMapper name={stat.icon} size={48} />
              </div>
            )}
            <div className="text-foreground mb-2 font-serif text-4xl font-bold">{stat.value}</div>
            <div className="text-muted-foreground text-lg">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const renderDetailsGrid = (block: DetailsGridBlock, key: string) => (
  <div key={key} className="container mx-auto max-w-6xl px-6 py-12">
    {block.sectionTitle && (
      <h2 className="text-foreground mb-8 font-serif text-3xl font-bold md:text-4xl">{block.sectionTitle}</h2>
    )}
    <DetailsGrid variant={block.variant ?? "grid-3"}>
      {block.items.map((item, itemIndex) => (
        <DetailsItem key={item.id ?? `item-${itemIndex}`} index={itemIndex}>
          <DetailsIcon>
            <IconMapper name={item.icon} size={20} />
          </DetailsIcon>
          <DetailsLabel>{item.label}</DetailsLabel>
          <DetailsValue>
            {item.link ? (
              <a href={item.link} className="text-accent hover:underline">
                {item.value}
              </a>
            ) : (
              item.value
            )}
          </DetailsValue>
        </DetailsItem>
      ))}
    </DetailsGrid>
  </div>
);

const renderTimeline = (block: TimelineBlock, key: string) => (
  <div key={key} className="container mx-auto max-w-6xl px-6 py-12">
    {block.sectionTitle && (
      <h2 className="text-foreground mb-12 font-serif text-3xl font-bold md:text-4xl">{block.sectionTitle}</h2>
    )}
    <Timeline variant={block.variant ?? "vertical"}>
      {block.items.map((item, itemIndex) => (
        <TimelineItem key={item.id ?? `timeline-${itemIndex}`} index={itemIndex}>
          <TimelineDate>{item.date}</TimelineDate>
          <TimelineTitle>{item.title}</TimelineTitle>
          <TimelineDescription>{item.description}</TimelineDescription>
        </TimelineItem>
      ))}
    </Timeline>
  </div>
);

const renderTestimonials = (block: TestimonialsBlock, key: string) => (
  <div key={key} className="container mx-auto max-w-6xl px-6 py-12">
    {block.sectionTitle && (
      <h2 className="text-foreground mb-12 font-serif text-3xl font-bold md:text-4xl">{block.sectionTitle}</h2>
    )}
    <Testimonials variant={block.variant ?? "grid"}>
      {block.items.map((item, itemIndex) => (
        <TestimonialCard key={item.id ?? `testimonial-${itemIndex}`} index={itemIndex}>
          {item.avatar && (
            <TestimonialAvatar>
              <IconMapper name={item.avatar} size={20} />
            </TestimonialAvatar>
          )}
          <TestimonialQuote>{item.quote}</TestimonialQuote>
          <TestimonialAuthor>{item.author}</TestimonialAuthor>
          {item.role && <TestimonialMeta>{item.role}</TestimonialMeta>}
        </TestimonialCard>
      ))}
    </Testimonials>
  </div>
);

const blockRenderers: Record<string, (block: Block, key: string) => React.ReactElement> = {
  hero: (block, key) => renderHero(block as HeroBlock, key),
  features: (block, key) => renderFeatures(block as FeaturesBlock, key),
  stats: (block, key) => renderStats(block as StatsBlock, key),
  detailsGrid: (block, key) => renderDetailsGrid(block as DetailsGridBlock, key),
  timeline: (block, key) => renderTimeline(block as TimelineBlock, key),
  testimonials: (block, key) => renderTestimonials(block as TestimonialsBlock, key),
  richText: (block, key) => (
    <div key={key} className="container mx-auto max-w-4xl px-6 py-12">
      <RichText content={(block as RichTextBlock).content as Parameters<typeof RichText>[0]["content"]} />
    </div>
  ),
  cta: (block, key) => {
    const b = block as CTABlock;
    return (
      <div key={key} className="bg-primary/5 py-16">
        <div className="container mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-foreground mb-4 font-serif text-3xl font-bold md:text-4xl">{b.headline}</h2>
          {b.description && <p className="text-muted-foreground mb-8 text-lg">{b.description}</p>}
          <Button asChild size="lg">
            <a href={b.buttonLink}>{b.buttonText}</a>
          </Button>
        </div>
      </div>
    );
  },
  newsletterForm: (block, key) => {
    const b = block as NewsletterFormBlock;
    return (
      <div key={key} className="container mx-auto max-w-xl px-6 py-8">
        <NewsletterForm
          headline={b.headline ?? undefined}
          placeholder={b.placeholder ?? undefined}
          buttonText={b.buttonText ?? undefined}
          onSubmit={newsletterSubmit}
        />
      </div>
    );
  },
  newsletterCTA: (block, key) => {
    const b = block as NewsletterCTABlock;
    return (
      <NewsletterCTA
        key={key}
        headline={b.headline ?? undefined}
        description={b.description ?? undefined}
        placeholder={b.placeholder ?? undefined}
        buttonText={b.buttonText ?? undefined}
        variant={b.variant ?? undefined}
        size={b.size ?? undefined}
        onSubmit={newsletterSubmit}
      />
    );
  },
};

export const BlockRenderer: React.FC<BlockRendererProps> = ({ blocks }) => (
  <>
    {(blocks ?? [])
      .filter((block) => block.blockType in blockRenderers)
      .map((block, index) => {
        const key = block.id ?? `${block.blockType}-${index}`;
        return blockRenderers[block.blockType]!(block, key);
      })}
  </>
);
