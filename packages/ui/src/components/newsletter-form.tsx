"use client";

/* oxlint-disable complexity */

/**
 * Compact newsletter subscription form with cartographic aesthetics.
 *
 * Design direction: Technical precision meets warm invitation - like plotting
 * coordinates on a vintage map. Features coordinate grid overlay, map pin
 * status indicator, and smooth "plotting" animations.
 *
 * Key aesthetic choices:
 * - Monospace font for technical precision (email as coordinates)
 * - Animated map pin that "plots" on successful submission
 * - Subtle grid pattern background
 * - Status colors from cartographic palette
 * - Playfair Display serif for headline warmth
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import * as React from "react";

import { type NewsletterMessages, useNewsletterSubscription } from "../hooks/use-newsletter-subscription";
import {
  type NewsletterButtonLabels,
  NewsletterEmailInput,
  NewsletterStatusMessage,
  NewsletterSubmitButton,
} from "./newsletter-shared";

export interface NewsletterFormProps {
  /** Optional headline text */
  headline?: string;
  /** Placeholder text for email input */
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
}

const NewsletterForm = React.forwardRef<HTMLDivElement, NewsletterFormProps>(
  (
    {
      headline = "Stay Mapped In",
      placeholder = "your@email.address",
      buttonText = "Subscribe",
      buttonLabels,
      additionalData,
      className,
      onSubmit,
      messages,
    },
    ref
  ) => {
    const { email, setEmail, status, message, handleSubmit } = useNewsletterSubscription({
      resetDelay: 5000,
      additionalData,
      messages,
      onSubmit,
    });

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-sm",
          "border-border dark:border-border border",
          "from-background/20 via-card/30 to-background/20 bg-gradient-to-br",
          "dark:from-muted/20 dark:via-card/5 dark:to-muted/20",
          "p-6",
          className
        )}
      >
        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Decorative coordinate marker */}
        <div className="pointer-events-none absolute top-4 right-4 font-mono text-[9px] tracking-widest opacity-20">
          {status === "success" ? "✓ PLOTTED" : "— —.— —°"}
        </div>

        <div className="relative">
          {headline && (
            <h3 className="text-primary dark:text-foreground mb-4 font-serif text-lg font-semibold">{headline}</h3>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <NewsletterEmailInput
              email={email}
              onEmailChange={setEmail}
              status={status}
              placeholder={placeholder}
              size="sm"
            />
            <NewsletterSubmitButton status={status} buttonText={buttonText} labels={buttonLabels} size="sm" />
          </form>

          <NewsletterStatusMessage status={status} message={message} />
        </div>
      </div>
    );
  }
);

NewsletterForm.displayName = "NewsletterForm";

export { NewsletterForm };
