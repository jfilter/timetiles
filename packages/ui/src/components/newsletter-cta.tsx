"use client";

/* oxlint-disable complexity */
/* eslint-disable sonarjs/max-lines-per-function -- large presentational component with intentional decorative markup */

/**
 * Large newsletter CTA section with immersive cartographic design.
 *
 * Design direction: A destination marker on a vintage map - bold, inviting,
 * and memorable. Features layered grid patterns, coordinate systems, compass
 * rose decorations, and smooth plotting animations.
 *
 * Key aesthetic choices:
 * - Large Playfair Display headlines for editorial authority
 * - Layered grid patterns (subtle survey map aesthetic)
 * - Compass rose and coordinate decorations
 * - Generous whitespace and breathing room
 * - Map pin animation with coordinate "plotting" effect
 * - Terracotta and navy accents from topographic maps
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { type NewsletterMessages, useNewsletterSubscription } from "../hooks/use-newsletter-subscription";
import {
  type NewsletterButtonLabels,
  NewsletterEmailInput,
  NewsletterStatusMessage,
  NewsletterSubmitButton,
} from "./newsletter-shared";

const newsletterCtaVariants = cva("relative overflow-hidden", {
  variants: {
    variant: {
      default:
        "bg-gradient-to-br from-background via-card to-background dark:from-muted dark:via-card/10 dark:to-muted",
      elevated: "bg-card border border-border shadow-lg",
      centered: "bg-gradient-to-b from-background via-background/20 to-background",
    },
    size: { default: "py-24 px-8", lg: "py-32 px-8", xl: "py-40 px-12" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface NewsletterCTAProps extends VariantProps<typeof newsletterCtaVariants> {
  /** Main headline */
  headline?: string;
  /** Supporting description */
  description?: string;
  /** Email input placeholder */
  placeholder?: string;
  /** Submit button text */
  buttonText?: string;
  /** Labels for button loading/success states */
  buttonLabels?: NewsletterButtonLabels;
  /** Additional data to include in POST request */
  additionalData?: Record<string, unknown>;
  /** Additional CSS classes */
  className?: string;
  /** Custom submission handler; delegates to this instead of UIProvider when provided */
  onSubmit?: (email: string, additionalData?: Record<string, unknown>) => Promise<void>;
  /** Message strings for success/error states (required for i18n) */
  messages: NewsletterMessages;
  /** Privacy/disclaimer text shown below the form */
  privacyNote?: string;
}

const NewsletterCTA = React.forwardRef<HTMLElement, NewsletterCTAProps>(
  (
    {
      variant,
      size,
      headline = "Never Miss a Discovery",
      description = "Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.",
      placeholder = "your@email.address",
      buttonText = "Subscribe to Updates",
      buttonLabels,
      additionalData,
      className,
      onSubmit,
      messages,
      privacyNote = "No spam, ever. Unsubscribe anytime. We respect your privacy.",
    },
    ref
  ) => {
    const { email, setEmail, status, message, handleSubmit } = useNewsletterSubscription({
      resetDelay: 8000,
      additionalData,
      messages,
      onSubmit,
    });

    return (
      <section ref={ref} className={cn(newsletterCtaVariants({ variant, size }), className)}>
        {/* Layered grid patterns - survey map aesthetic */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 2px, transparent 2px),
              linear-gradient(to bottom, currentColor 2px, transparent 2px)
            `,
            backgroundSize: "240px 240px",
          }}
        />

        {/* Decorative compass rose */}
        <div className="pointer-events-none absolute top-12 left-12 h-24 w-24 opacity-[0.06] dark:opacity-[0.04]">
          <svg viewBox="0 0 100 100" fill="currentColor" className="text-primary dark:text-foreground">
            <circle cx="50" cy="50" r="3" />
            {/* North point */}
            <path d="M50 10 L54 46 L50 50 L46 46 Z" />
            {/* East point */}
            <path d="M90 50 L54 54 L50 50 L54 46 Z" />
            {/* South point */}
            <path d="M50 90 L46 54 L50 50 L54 54 Z" />
            {/* West point */}
            <path d="M10 50 L46 46 L50 50 L46 54 Z" />
            {/* Intermediate points */}
            <path d="M73 27 L54 48 L50 50 L52 46 Z" opacity="0.6" />
            <path d="M73 73 L52 54 L50 50 L54 52 Z" opacity="0.6" />
            <path d="M27 73 L46 52 L50 50 L48 54 Z" opacity="0.6" />
            <path d="M27 27 L48 46 L50 50 L46 48 Z" opacity="0.6" />
            {/* Rings */}
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="0.2" />
          </svg>
        </div>

        {/* Decorative coordinates */}
        <div className="pointer-events-none absolute top-12 right-12 space-y-1 font-mono text-[10px] tracking-widest opacity-20">
          <div>NEWSLETTER</div>
          <div>— —.— —°N</div>
          <div>— —.— —°W</div>
        </div>

        <div className="relative container mx-auto max-w-4xl">
          {/* Content */}
          <div className="mb-12 text-center">
            {headline && (
              <h2 className="text-primary dark:text-foreground mb-6 font-serif text-4xl leading-tight font-bold md:text-5xl">
                {headline}
              </h2>
            )}
            {description && (
              <p className="text-foreground/70 dark:text-foreground/70 mx-auto max-w-2xl text-lg leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mx-auto max-w-xl">
            <div className="relative">
              {/* Input and button combined */}
              <div className="flex flex-col gap-3 md:flex-row">
                <NewsletterEmailInput
                  email={email}
                  onEmailChange={setEmail}
                  status={status}
                  placeholder={placeholder}
                  size="md"
                />
                <NewsletterSubmitButton
                  status={status}
                  buttonText={buttonText}
                  labels={buttonLabels}
                  showCheckIcon
                  size="md"
                />
              </div>

              <NewsletterStatusMessage status={status} message={message} decorated />
            </div>

            {/* Privacy note */}
            <p className="text-foreground/40 dark:text-foreground/40 mt-6 text-center font-mono text-xs tracking-wide">
              {privacyNote}
            </p>
          </form>
        </div>
      </section>
    );
  }
);

NewsletterCTA.displayName = "NewsletterCTA";

export { NewsletterCTA, newsletterCtaVariants };
