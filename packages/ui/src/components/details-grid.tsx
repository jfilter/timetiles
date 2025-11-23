"use client";

/**
 * DetailsGrid Component
 *
 * Generic grid of cards displaying icon + label + value information.
 * Useful for contact details, specifications, features, team info, etc.
 *
 * Design: Editorial cartography with asymmetric grid offsets and staggered
 * reveal animations. Cards feel like coordinate markers being plotted on a map.
 *
 * @module
 * @category Components
 */
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Container variants for DetailsGrid layout
 */
const detailsGridVariants = cva("w-full", {
  variants: {
    variant: {
      "grid-2": "grid grid-cols-1 md:grid-cols-2 gap-6",
      "grid-3": "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
      "grid-4": "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6",
      compact: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
    },
  },
  defaultVariants: {
    variant: "grid-3",
  },
});

/**
 * Individual card variants with cartographic explorer styling
 */
const detailsItemVariants = cva([
  "group relative overflow-hidden",
  "bg-card border-2 border-accent/20",
  "p-8 transition-all duration-500",
  "rounded-sm",
  "shadow-md",
  "hover:shadow-xl hover:border-accent/40 hover:-translate-y-1",
]);

/**
 * Icon wrapper styled as cartographic map pin marker
 */
const detailsIconVariants = cva([
  "relative flex items-center justify-center",
  "w-16 h-16 mb-6",
  "rounded-full",
  "bg-accent text-accent-foreground",
  "transition-all duration-500",
  "shadow-lg shadow-accent/20",
  "border-4 border-background",
  // Ring effect like map marker
  "before:absolute before:inset-0",
  "before:rounded-full before:border-2 before:border-accent/30",
  "before:scale-110",
  // Hover: pulse and scale
  "group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-accent/30",
  "group-hover:before:scale-125 group-hover:before:opacity-0",
  "before:transition-all before:duration-500",
]);

/**
 * Label (heading) with bold cartographic typography
 */
const detailsLabelVariants = cva([
  "font-serif text-2xl font-bold",
  "text-foreground mb-3",
  "tracking-tight",
  "leading-tight",
]);

/**
 * Value (content) with clean sans-serif
 */
const detailsValueVariants = cva([
  "text-muted-foreground",
  "text-sm leading-relaxed",
  // Support for link styling
  "[&_a]:text-accent [&_a]:hover:underline [&_a]:transition-colors",
]);

export interface DetailsGridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof detailsGridVariants> {
  children: React.ReactNode;
}

/**
 * DetailsGrid container component
 */
export const DetailsGrid = React.forwardRef<HTMLDivElement, DetailsGridProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(detailsGridVariants({ variant }), className)} {...props}>
        {children}
      </div>
    );
  }
);
DetailsGrid.displayName = "DetailsGrid";

export interface DetailsItemProps extends React.HTMLAttributes<HTMLDivElement> {
  index?: number;
  children: React.ReactNode;
}

/**
 * Individual details card component with cartographic coordinates
 */
export const DetailsItem = React.forwardRef<HTMLDivElement, DetailsItemProps>(
  ({ className, index = 0, children, ...props }, ref) => {
    // Stagger animation delays
    const delay = `${index * 150}ms`;
    const style = React.useMemo(() => ({ animationDelay: delay }), [delay]);

    return (
      <div ref={ref} className={cn(detailsItemVariants(), className)} style={style} {...props}>
        {children}
      </div>
    );
  }
);
DetailsItem.displayName = "DetailsItem";

export interface DetailsIconProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Icon wrapper component
 */
export const DetailsIcon = React.forwardRef<HTMLDivElement, DetailsIconProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(detailsIconVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
DetailsIcon.displayName = "DetailsIcon";

export interface DetailsLabelProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

/**
 * Label (heading) component with editorial typography
 */
export const DetailsLabel = React.forwardRef<HTMLHeadingElement, DetailsLabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <h3 ref={ref} className={cn(detailsLabelVariants(), className)} {...props}>
        {children}
      </h3>
    );
  }
);
DetailsLabel.displayName = "DetailsLabel";

export interface DetailsValueProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Value (content) component
 */
export const DetailsValue = React.forwardRef<HTMLDivElement, DetailsValueProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(detailsValueVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
DetailsValue.displayName = "DetailsValue";
