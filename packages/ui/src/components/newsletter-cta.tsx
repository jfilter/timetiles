"use client";

/* eslint-disable complexity, sonarjs/max-lines-per-function, react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-function-as-prop, @typescript-eslint/no-misused-promises */

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

const newsletterCtaVariants = cva("relative overflow-hidden", {
  variants: {
    variant: {
      default:
        "bg-gradient-to-br from-parchment via-cream to-parchment dark:from-charcoal/30 dark:via-cream/10 dark:to-charcoal/30",
      elevated: "bg-card border border-border shadow-lg",
      centered: "bg-gradient-to-b from-background via-parchment/20 to-background",
    },
    size: {
      default: "py-24 px-8",
      lg: "py-32 px-8",
      xl: "py-40 px-12",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
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
  /** Additional data to include in POST request */
  additionalData?: Record<string, unknown>;
  /** Additional CSS classes */
  className?: string;
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

const NewsletterCTA = React.forwardRef<HTMLElement, NewsletterCTAProps>(
  (
    {
      variant,
      size,
      headline = "Never Miss a Discovery",
      description = "Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.",
      placeholder = "your@email.address",
      buttonText = "Subscribe to Updates",
      additionalData,
      className,
    },
    ref
  ) => {
    const [email, setEmail] = React.useState("");
    const [status, setStatus] = React.useState<SubmitStatus>("idle");
    const [message, setMessage] = React.useState("");

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!email) return;

      setStatus("loading");
      setMessage("");

      try {
        const response = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, ...additionalData }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage("Successfully subscribed! Check your email to confirm.");
          setEmail("");
        } else {
          setStatus("error");
          setMessage(data.error || "Subscription failed. Please try again.");
        }
      } catch (error) {
        setStatus("error");
        const errorMessage = error instanceof Error ? error.message : "Network error. Please try again.";
        setMessage(errorMessage);
      }

      // Reset status after 8 seconds
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 8000);
    };

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
        <div className="pointer-events-none absolute left-12 top-12 h-24 w-24 opacity-[0.06] dark:opacity-[0.04]">
          <svg viewBox="0 0 100 100" fill="currentColor" className="text-navy dark:text-parchment">
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
        <div className="pointer-events-none absolute right-12 top-12 space-y-1 font-mono text-[10px] tracking-widest opacity-20">
          <div>NEWSLETTER</div>
          <div>— —.— —°N</div>
          <div>— —.— —°W</div>
        </div>

        <div className="container relative mx-auto max-w-4xl">
          {/* Content */}
          <div className="mb-12 text-center">
            {headline && (
              <h2 className="text-navy dark:text-parchment mb-6 font-serif text-4xl font-bold leading-tight md:text-5xl">
                {headline}
              </h2>
            )}
            {description && (
              <p className="text-charcoal/70 dark:text-parchment/70 mx-auto max-w-2xl text-lg leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mx-auto max-w-xl">
            <div className="relative">
              {/* Input and button combined */}
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={placeholder}
                    disabled={status === "loading" || status === "success"}
                    className={cn(
                      "h-14 w-full rounded-sm border px-6 py-3",
                      "border-charcoal/20 dark:border-parchment/20",
                      "bg-background/80 backdrop-blur-sm",
                      "text-foreground font-mono text-base",
                      "placeholder:text-muted-foreground placeholder:font-sans placeholder:text-sm",
                      "transition-all duration-300",
                      "focus:border-navy focus:ring-navy/20 focus:outline-none focus:ring-2",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      status === "success" && "border-forest ring-forest/20 ring-2"
                    )}
                    required
                  />

                  {/* Animated status indicator */}
                  {status !== "idle" && (
                    <div className={cn("absolute right-4 top-1/2 -translate-y-1/2", "transition-all duration-300")}>
                      {status === "loading" && (
                        <div className="border-navy h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
                      )}
                      {status === "success" && (
                        <svg
                          className="text-forest h-6 w-6 animate-[plot-point_0.6s_ease-out]"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                        </svg>
                      )}
                      {status === "error" && (
                        <svg className="text-destructive h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={status === "loading" || status === "success"}
                  className={cn(
                    "group relative h-14 overflow-hidden rounded-sm px-8",
                    "bg-navy text-parchment",
                    "font-sans text-base font-semibold tracking-wide",
                    "transition-all duration-300",
                    "hover:bg-navy/90 hover:scale-[1.02] hover:shadow-xl",
                    "focus:ring-navy focus:outline-none focus:ring-2 focus:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
                    "active:scale-[0.98]",
                    status === "success" && "bg-forest hover:bg-forest/90"
                  )}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {status === "loading" && "Subscribing..."}
                    {status === "success" && (
                      <>
                        Subscribed
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </>
                    )}
                    {(status === "idle" || status === "error") && buttonText}
                  </span>

                  {/* Hover effect - coordinate line sweep */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </button>
              </div>

              {/* Status message */}
              {message && (
                <div
                  className={cn(
                    "animate-fade-in mt-4 flex items-start gap-2 rounded-sm p-4",
                    status === "success" && "bg-forest/10 border-forest/20 border",
                    status === "error" && "bg-destructive/10 border-destructive/20 border"
                  )}
                >
                  <div className="flex-shrink-0">
                    {status === "success" && (
                      <svg className="text-forest h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {status === "error" && (
                      <svg className="text-destructive h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-sm font-medium leading-relaxed",
                      status === "success" && "text-forest dark:text-forest",
                      status === "error" && "text-destructive"
                    )}
                  >
                    {message}
                  </p>
                </div>
              )}
            </div>

            {/* Privacy note */}
            <p className="text-charcoal/40 dark:text-parchment/40 mt-6 text-center font-mono text-xs tracking-wide">
              No spam, ever. Unsubscribe anytime. We respect your privacy.
            </p>
          </form>
        </div>
      </section>
    );
  }
);

NewsletterCTA.displayName = "NewsletterCTA";

export { NewsletterCTA, newsletterCtaVariants };
