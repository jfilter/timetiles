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
} from "@workspace/ui";
import React from "react";

import { IconMapper } from "./icon-mapper";
import { RichText } from "./layout/rich-text";

// Type definitions for blocks
interface HeroBlock {
  blockType: "hero";
  title: string;
  subtitle?: string | null;
  description?: string | null;
  background?: "gradient" | "grid" | null;
  buttons?: Array<{
    text: string;
    link: string;
    variant?: "default" | "outline" | null;
    id?: string | null;
  }> | null;
  id?: string | null;
  blockName?: string | null;
}

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  accent?: "primary" | "secondary" | "accent" | "muted" | "none" | null;
  id?: string | null;
}

interface FeaturesBlock {
  blockType: "features";
  sectionTitle?: string | null;
  sectionDescription?: string | null;
  features: FeatureItem[];
  columns?: "1" | "2" | "3" | "4" | null;
  id?: string | null;
  blockName?: string | null;
}

interface StatItem {
  value: string;
  label: string;
  icon?: string | null;
  id?: string | null;
}

interface StatsBlock {
  blockType: "stats";
  stats: StatItem[];
  id?: string | null;
  blockName?: string | null;
}

interface ContactMethodItem {
  icon: string;
  label: string;
  value: string;
  link?: string | null;
  id?: string | null;
}

interface ContactMethodsBlock {
  blockType: "contactMethods";
  methods: ContactMethodItem[];
  id?: string | null;
  blockName?: string | null;
}

interface RichTextBlock {
  blockType: "richText";
  content: unknown;
  id?: string | null;
  blockName?: string | null;
}

interface CTABlock {
  blockType: "cta";
  headline: string;
  description?: string | null;
  buttonText: string;
  buttonLink: string;
  id?: string | null;
  blockName?: string | null;
}

type Block = HeroBlock | FeaturesBlock | StatsBlock | ContactMethodsBlock | RichTextBlock | CTABlock;

interface BlockRendererProps {
  blocks: Block[];
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ blocks }) => {
  if (!blocks || blocks.length === 0) {
    return null;
  }

  return (
    <>
      {/* eslint-disable-next-line sonarjs/max-lines-per-function -- Block renderer requires large switch statement for all block types */}
      {blocks.map((block, index) => {
        const key = block.id ?? `${block.blockType}-${index}`;

        switch (block.blockType) {
          case "hero": {
            // Map CMS background values to Hero component values
            const heroBackground = block.background === "gradient" ? "grid" : (block.background ?? "grid");
            return (
              <Hero key={key} background={heroBackground}>
                <HeroHeadline>{block.title}</HeroHeadline>
                {block.subtitle && <HeroSubheadline>{block.subtitle}</HeroSubheadline>}
                {block.description && (
                  <p className="text-muted-foreground mt-4 text-center text-lg">{block.description}</p>
                )}
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
          }

          case "features": {
            // Convert string column value to number literal for FeaturesGrid
            const columnCount = (block.columns ? parseInt(block.columns, 10) : 3) as 1 | 2 | 3 | 4;
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
          }

          case "stats":
            return (
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

          case "contactMethods":
            return (
              <div key={key} className="container mx-auto max-w-4xl px-6 py-12">
                <div className="space-y-6">
                  {block.methods.map((method, methodIndex) => (
                    <div key={method.id ?? `method-${methodIndex}`} className="flex items-start gap-4">
                      <div className="text-primary mt-1">
                        <IconMapper name={method.icon} size={24} />
                      </div>
                      <div>
                        <div className="text-foreground mb-1 font-semibold">{method.label}</div>
                        {method.link ? (
                          <a href={method.link} className="text-primary hover:underline">
                            {method.value}
                          </a>
                        ) : (
                          <div className="text-muted-foreground">{method.value}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );

          case "richText":
            return (
              <div key={key} className="container mx-auto max-w-4xl px-6 py-12">
                <RichText content={block.content as Parameters<typeof RichText>[0]["content"]} />
              </div>
            );

          case "cta":
            return (
              <div key={key} className="bg-primary/5 py-16">
                <div className="container mx-auto max-w-4xl px-6 text-center">
                  <h2 className="text-foreground mb-4 font-serif text-3xl font-bold md:text-4xl">{block.headline}</h2>
                  {block.description && <p className="text-muted-foreground mb-8 text-lg">{block.description}</p>}
                  <Button asChild size="lg">
                    <a href={block.buttonLink}>{block.buttonText}</a>
                  </Button>
                </div>
              </div>
            );

          default:
            return null;
        }
      })}
    </>
  );
};
