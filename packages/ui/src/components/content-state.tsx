/**
 * General-purpose component for empty, no-match, and error states.
 *
 * Provides consistent messaging and visuals when content areas have
 * nothing to display, with support for custom icons, titles, and retry actions.
 *
 * @module
 * @category Components
 */
"use client";

import { AlertTriangle, Filter, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { useUILabels } from "../provider";

export interface ContentStateProps {
  /** Type of content state to display */
  variant: "empty" | "no-match" | "error";
  /** Override default icon per variant */
  icon?: ReactNode;
  /** Override default title */
  title?: string;
  /** Override default subtitle */
  subtitle?: string;
  /** Shows retry button (error variant only) */
  onRetry?: () => void;
  /** Override the retry button label (localize from the app side) */
  retryLabel?: string;
  /** Container height (number treated as px, string used as-is) */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
}

const defaultIcons: Record<ContentStateProps["variant"], ReactNode> = {
  empty: <Inbox className="h-12 w-12" />,
  "no-match": <Filter className="h-12 w-12" />,
  error: <AlertTriangle className="h-12 w-12" />,
};

/**
 * Content state component for empty, no-match, and error displays.
 *
 * @example
 * ```tsx
 * <ContentState variant="empty" />
 * <ContentState variant="no-match" title="No events found" />
 * <ContentState variant="error" onRetry={() => refetch()} />
 * ```
 */
export const ContentState = ({
  variant,
  icon,
  title,
  subtitle,
  onRetry,
  retryLabel,
  height,
  className,
}: ContentStateProps) => {
  const labels = useUILabels();
  const containerStyle = (() => {
    if (height == null) return undefined;
    const containerHeight = typeof height === "number" ? `${height}px` : height;
    return { height: containerHeight };
  })();

  const variantDefaults = {
    empty: { title: labels.emptyTitle, subtitle: labels.emptySubtitle },
    "no-match": { title: labels.noMatchTitle, subtitle: labels.noMatchSubtitle },
    error: { title: labels.errorTitle, subtitle: labels.errorSubtitle },
  }[variant];
  const renderedIcon = icon ?? defaultIcons[variant];

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} style={containerStyle}>
      <div className={cn("text-muted-foreground/50", variant === "error" && "text-destructive/50")}>{renderedIcon}</div>
      <div className="text-center">
        <p className="text-foreground text-sm font-medium">{title ?? variantDefaults.title}</p>
        <p className="text-muted-foreground mt-1 text-xs">{subtitle ?? variantDefaults.subtitle}</p>
      </div>
      {variant === "error" && onRetry != null && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 rounded-sm px-4 py-1.5 text-xs font-medium transition-colors"
        >
          {retryLabel ?? labels.tryAgain}
        </button>
      )}
    </div>
  );
};
