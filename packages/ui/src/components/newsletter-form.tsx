"use client";

/* eslint-disable complexity, sonarjs/max-lines-per-function, react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-function-as-prop, @typescript-eslint/no-misused-promises */

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
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

const NewsletterForm = React.forwardRef<HTMLDivElement, NewsletterFormProps>(
  (
    {
      headline = "Stay Mapped In",
      placeholder = "your@email.address",
      buttonText = "Subscribe",
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
          setMessage("Successfully subscribed!");
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

      // Reset status after 5 seconds
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-sm",
          "border-charcoal/10 dark:border-parchment/10 border",
          "from-parchment/20 via-cream/30 to-parchment/20 bg-gradient-to-br",
          "dark:from-charcoal/20 dark:via-cream/5 dark:to-charcoal/20",
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
        <div className="pointer-events-none absolute right-4 top-4 font-mono text-[9px] tracking-widest opacity-20">
          {status === "success" ? "✓ PLOTTED" : "— —.— —°"}
        </div>

        <div className="relative">
          {headline && (
            <h3 className="text-navy dark:text-parchment mb-4 font-serif text-lg font-semibold">{headline}</h3>
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
                  "border-charcoal/20 dark:border-parchment/20",
                  "bg-background/50 backdrop-blur-sm",
                  "text-foreground font-mono text-sm",
                  "placeholder:text-muted-foreground placeholder:font-sans",
                  "transition-all duration-200",
                  "focus:border-navy focus:ring-navy/20 focus:outline-none focus:ring-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  status === "success" && "border-forest"
                )}
                required
              />

              {/* Animated status indicator (map pin) */}
              {status !== "idle" && (
                <div
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2",
                    "transition-all duration-300",
                    status === "loading" && "animate-pulse",
                    status === "success" && "animate-[plot-point_0.6s_ease-out]"
                  )}
                >
                  {status === "loading" && (
                    <div className="border-navy h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                  )}
                  {status === "success" && (
                    <svg className="text-forest h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                  )}
                  {status === "error" && (
                    <svg className="text-destructive h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                "group relative h-11 w-full overflow-hidden rounded-sm",
                "bg-navy text-parchment",
                "font-sans text-sm font-medium tracking-wide",
                "transition-all duration-300",
                "hover:bg-navy/90 hover:shadow-lg",
                "focus:ring-navy focus:outline-none focus:ring-2 focus:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "active:scale-[0.98]",
                status === "success" && "bg-forest hover:bg-forest/90"
              )}
            >
              <span className="relative z-10">
                {status === "loading" && "Subscribing..."}
                {status === "success" && "Subscribed ✓"}
                {(status === "idle" || status === "error") && buttonText}
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
                status === "success" && "text-forest dark:text-forest",
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
