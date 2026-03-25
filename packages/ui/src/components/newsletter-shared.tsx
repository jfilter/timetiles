/**
 * Shared newsletter UI primitives used by both NewsletterForm and NewsletterCTA.
 *
 * Extracts the duplicated status indicator icons, button content logic, and
 * status message rendering into reusable components.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import * as React from "react";

import type { NewsletterStatus } from "../hooks/use-newsletter-subscription";

/** Map pin SVG for success state */
const MapPinIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

/** Error circle SVG */
const ErrorIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

/** Animated status indicator shown inside the email input field. */
export const NewsletterStatusIndicator = ({
  status,
  size = "sm",
}: {
  status: NewsletterStatus;
  /** "sm" for compact form (h-4/h-5), "md" for CTA (h-5/h-6) */
  size?: "sm" | "md";
}) => {
  if (status === "idle") return null;

  const spinnerSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const iconSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2",
        size === "sm" ? "right-3" : "right-4",
        "transition-all duration-300",
        status === "loading" && "animate-pulse",
        status === "success" && "animate-[plot-point_0.6s_ease-out]"
      )}
    >
      {status === "loading" && (
        <div className={cn("border-primary animate-spin rounded-full border-2 border-t-transparent", spinnerSize)} />
      )}
      {status === "success" && <MapPinIcon className={cn("text-accent", iconSize)} />}
      {status === "error" && <ErrorIcon className={cn("text-destructive", iconSize)} />}
    </div>
  );
};

/** Button text content based on submission status. */
export const NewsletterButtonContent = ({
  status,
  buttonText,
  showCheckIcon = false,
}: {
  status: NewsletterStatus;
  buttonText: string;
  /** Show a checkmark icon next to "Subscribed" (used by CTA variant) */
  showCheckIcon?: boolean;
}) => {
  if (status === "loading") return <>Subscribing...</>;
  if (status === "success") {
    return showCheckIcon ? (
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
    ) : (
      <>Subscribed ✓</>
    );
  }
  return <>{buttonText}</>;
};

/** Shared email input used by both NewsletterForm and NewsletterCTA. */
export const NewsletterEmailInput = ({
  email,
  onEmailChange,
  status,
  placeholder = "your@email.address",
  size = "sm",
  className,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  status: NewsletterStatus;
  placeholder?: string;
  /** "sm" for compact form, "md" for CTA variant */
  size?: "sm" | "md";
  className?: string;
}) => {
  const isDisabled = status === "loading" || status === "success";

  return (
    <div className={cn("relative", size === "md" && "flex-1", className)}>
      <input
        type="email"
        value={email}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEmailChange(e.target.value)}
        placeholder={placeholder}
        disabled={isDisabled}
        className={cn(
          "w-full rounded-sm border",
          size === "sm" ? "h-11 px-4 py-2" : "h-14 px-6 py-3",
          "border-border dark:border-border",
          size === "sm" ? "bg-background/50 backdrop-blur-sm" : "bg-background/80 backdrop-blur-sm",
          "text-foreground font-mono",
          size === "sm" ? "text-sm" : "text-base",
          size === "sm"
            ? "placeholder:text-muted-foreground placeholder:font-sans"
            : "placeholder:text-muted-foreground placeholder:font-sans placeholder:text-sm",
          size === "sm" ? "transition-all duration-200" : "transition-all duration-300",
          "focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          status === "success" && (size === "sm" ? "border-accent" : "border-accent ring-accent/20 ring-2")
        )}
        required
      />
      <NewsletterStatusIndicator status={status} size={size} />
    </div>
  );
};

/** Shared submit button used by both NewsletterForm and NewsletterCTA. */
export const NewsletterSubmitButton = ({
  status,
  buttonText = "Subscribe",
  showCheckIcon = false,
  size = "sm",
  className,
}: {
  status: NewsletterStatus;
  buttonText?: string;
  showCheckIcon?: boolean;
  /** "sm" for compact form, "md" for CTA variant */
  size?: "sm" | "md";
  className?: string;
}) => {
  const isDisabled = status === "loading" || status === "success";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={cn(
        "group relative overflow-hidden rounded-sm",
        size === "sm" ? "h-11 w-full" : "h-14 px-8",
        "bg-primary text-primary-foreground",
        size === "sm"
          ? "font-sans text-sm font-medium tracking-wide"
          : "font-sans text-base font-semibold tracking-wide",
        "transition-all duration-300",
        size === "sm"
          ? "hover:bg-primary/90 hover:shadow-lg"
          : "hover:bg-primary/90 hover:scale-[1.02] hover:shadow-xl",
        "focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none",
        size === "sm"
          ? "disabled:cursor-not-allowed disabled:opacity-50"
          : "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
        "active:scale-[0.98]",
        status === "success" && "bg-accent hover:bg-accent/90",
        className
      )}
    >
      <span className={cn("relative z-10", size === "md" && "flex items-center gap-2")}>
        <NewsletterButtonContent status={status} buttonText={buttonText} showCheckIcon={showCheckIcon} />
      </span>

      {/* Hover effect - coordinate line sweep */}
      <div
        className={cn(
          "absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 group-hover:translate-x-full",
          size === "sm" ? "via-white/10" : "via-white/15"
        )}
      />
    </button>
  );
};

/** Shared status message display used by both NewsletterForm and NewsletterCTA. */
export const NewsletterStatusMessage = ({
  status,
  message,
  decorated = false,
}: {
  status: NewsletterStatus;
  message: string;
  /** When true, renders a decorated panel with icons (CTA variant); otherwise a simple text line */
  decorated?: boolean;
}) => {
  if (!message) return null;

  if (decorated) {
    return (
      <div
        className={cn(
          "animate-fade-in mt-4 flex items-start gap-2 rounded-sm p-4",
          status === "success" && "bg-accent/10 border-accent/20 border",
          status === "error" && "bg-destructive/10 border-destructive/20 border"
        )}
      >
        <div className="flex-shrink-0">
          {status === "success" && (
            <svg className="text-accent h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
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
            "text-sm leading-relaxed font-medium",
            status === "success" && "text-accent dark:text-accent",
            status === "error" && "text-destructive"
          )}
        >
          {message}
        </p>
      </div>
    );
  }

  return (
    <p
      className={cn(
        "animate-fade-in mt-3 font-mono text-xs tracking-wide",
        status === "success" && "text-accent dark:text-accent",
        status === "error" && "text-destructive"
      )}
    >
      {message}
    </p>
  );
};
