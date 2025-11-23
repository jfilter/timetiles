"use client";

/**
 * Timeline Component
 *
 * Chronological event display for project history, roadmap, changelog, milestones.
 *
 * Design: Cartographic journey - timeline feels like tracing a route on a map
 * with waypoint markers. Connecting line represents the path traveled.
 *
 * @module
 * @category Components
 */
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Container variants for Timeline layout
 */
const timelineVariants = cva("relative w-full space-y-8", {
  variants: {
    variant: {
      vertical: "max-w-3xl mx-auto",
      compact: "max-w-2xl mx-auto space-y-6",
    },
  },
  defaultVariants: {
    variant: "vertical",
  },
});

/**
 * Timeline connecting line (the journey path)
 */
const timelineLineVariants = cva([
  "absolute left-6 top-0 bottom-0",
  "w-1 bg-gradient-to-b from-accent via-accent/60 to-accent/20",
  "rounded-full",
  // Shadow for depth
  "shadow-sm",
]);

/**
 * Individual timeline item with date marker
 */
const timelineItemVariants = cva(["relative pl-16 mb-12"]);

/**
 * Date marker (waypoint on the map)
 */
const timelineDateVariants = cva([
  "absolute left-0 top-1",
  "flex items-center justify-center",
  "w-12 h-12",
  "rounded-full",
  "bg-accent text-accent-foreground",
  "font-mono text-xs font-bold",
  "shadow-md shadow-accent/20",
  "border-4 border-background",
  "transition-all duration-300",
  // Subtle hover effect
  "hover:scale-110 hover:shadow-lg hover:shadow-accent/25",
]);

/**
 * Title with editorial typography
 */
const timelineTitleVariants = cva([
  "font-serif text-2xl font-bold",
  "text-foreground mb-3",
  "tracking-tight",
  "drop-shadow-sm",
]);

/**
 * Description text
 */
const timelineDescriptionVariants = cva([
  "text-muted-foreground",
  "text-base leading-relaxed",
  "max-w-prose",
  "pl-4 border-l-2 border-accent/20",
]);

export interface TimelineProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof timelineVariants> {
  children: React.ReactNode;
}

/**
 * Timeline container component
 */
const timelineLineStyle = {
  animationDuration: "800ms",
  animationFillMode: "both",
} as const;

export const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(timelineVariants({ variant }), className)} {...props}>
        {/* Connecting line (journey path) */}
        <div className={cn(timelineLineVariants())} style={timelineLineStyle} />
        {children}
      </div>
    );
  }
);
Timeline.displayName = "Timeline";

export interface TimelineItemProps extends React.HTMLAttributes<HTMLDivElement> {
  index?: number;
  children: React.ReactNode;
}

/**
 * Individual timeline item component
 */
export const TimelineItem = React.forwardRef<HTMLDivElement, TimelineItemProps>(
  ({ className, index = 0, children, ...props }, ref) => {
    // Stagger animation delays for each item
    const delay = `${index * 150}ms`;
    const style = React.useMemo(() => ({ animationDelay: delay }), [delay]);
    return (
      <div ref={ref} className={cn(timelineItemVariants(), className)} style={style} {...props}>
        {children}
      </div>
    );
  }
);
TimelineItem.displayName = "TimelineItem";

export interface TimelineDateProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Date marker component (waypoint)
 */
export const TimelineDate = React.forwardRef<HTMLDivElement, TimelineDateProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(timelineDateVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
TimelineDate.displayName = "TimelineDate";

export interface TimelineTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

/**
 * Title component with editorial typography
 */
export const TimelineTitle = React.forwardRef<HTMLHeadingElement, TimelineTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <h3 ref={ref} className={cn(timelineTitleVariants(), className)} {...props}>
        {children}
      </h3>
    );
  }
);
TimelineTitle.displayName = "TimelineTitle";

export interface TimelineDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Description component
 */
export const TimelineDescription = React.forwardRef<HTMLDivElement, TimelineDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(timelineDescriptionVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
TimelineDescription.displayName = "TimelineDescription";
