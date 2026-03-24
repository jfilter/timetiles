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

type SubmitStatus = "idle" | "loading" | "success" | "error";

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
  status: SubmitStatus;
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
  status: SubmitStatus;
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
