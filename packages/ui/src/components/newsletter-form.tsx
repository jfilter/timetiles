"use client";

/* oxlint-disable complexity */
/* eslint-disable sonarjs/max-lines-per-function, @typescript-eslint/no-misused-promises */

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

import { useNewsletterSubscription } from "../hooks/use-newsletter-subscription";
import { NewsletterButtonContent, NewsletterStatusIndicator } from "./newsletter-shared";

export interface NewsletterFormProps {
  /** Optional headline text */
  headline?: string;
  /** Placeholder text for email input */
  placeholder?: string;
  /** Submit button text */
  buttonText?: string;
  /** Additional data to include in POST request */
  additionalData?: Record<string, unknown>;
  /** Additional CSS classes */
  className?: string;
  /** Custom submission handler; delegates to this instead of built-in fetch when provided */
  onSubmit?: (email: string, additionalData?: Record<string, unknown>) => Promise<void>;
}

const NewsletterForm = React.forwardRef<HTMLDivElement, NewsletterFormProps>(
  (
    {
      headline = "Stay Mapped In",
      placeholder = "your@email.address",
      buttonText = "Subscribe",
      additionalData,
      className,
      onSubmit,
    },
    ref
  ) => {
    const { email, setEmail, status, message, handleSubmit } = useNewsletterSubscription({
      resetDelay: 5000,
      additionalData,
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
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={placeholder}
                disabled={status === "loading" || status === "success"}
                className={cn(
                  "h-11 w-full rounded-sm border px-4 py-2",
                  "border-border dark:border-border",
                  "bg-background/50 backdrop-blur-sm",
                  "text-foreground font-mono text-sm",
                  "placeholder:text-muted-foreground placeholder:font-sans",
                  "transition-all duration-200",
                  "focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  status === "success" && "border-accent"
                )}
                required
              />
              <NewsletterStatusIndicator status={status} size="sm" />
            </div>

            <button
              type="submit"
              disabled={status === "loading" || status === "success"}
              className={cn(
                "group relative h-11 w-full overflow-hidden rounded-sm",
                "bg-primary text-primary-foreground",
                "font-sans text-sm font-medium tracking-wide",
                "transition-all duration-300",
                "hover:bg-primary/90 hover:shadow-lg",
                "focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "active:scale-[0.98]",
                status === "success" && "bg-accent hover:bg-accent/90"
              )}
            >
              <span className="relative z-10">
                <NewsletterButtonContent status={status} buttonText={buttonText} />
              </span>

              {/* Hover effect - coordinate line sweep */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
          </form>

          {/* Status message */}
          {message && (
            <p
              className={cn(
                "animate-fade-in mt-3 font-mono text-xs tracking-wide",
                status === "success" && "text-accent dark:text-accent",
                status === "error" && "text-destructive"
              )}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }
);

NewsletterForm.displayName = "NewsletterForm";

export { NewsletterForm };
