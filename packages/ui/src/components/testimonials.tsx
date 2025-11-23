"use client";

/**
 * Testimonials Component
 *
 * Highlighted quotes and testimonials for social proof, community feedback,
 * feature highlights.
 *
 * Design: Editorial magazine aesthetic with large serif quotation marks,
 * generous whitespace, and refined typography for authority.
 *
 * @module
 * @category Components
 */
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Container variants for Testimonials layout
 */
const testimonialsVariants = cva("w-full", {
  variants: {
    variant: {
      grid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
      single: "max-w-2xl mx-auto space-y-6",
      masonry: "columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6",
    },
  },
  defaultVariants: {
    variant: "single",
  },
});

/**
 * Individual testimonial card with editorial magazine styling
 */
const testimonialCardVariants = cva([
  "relative group overflow-hidden",
  "bg-card/50 border-2 border-border",
  "p-8 rounded",
  "shadow-sm",
  "transition-all duration-300",
  // Editorial accent: thick left border
  "border-l-4 border-l-accent",
  // Subtle hover effects
  "hover:shadow-md hover:border-accent/30 hover:bg-card/70",
]);

/**
 * Quote text with editorial magazine typography - large, bold pull quote style
 */
const testimonialQuoteVariants = cva([
  "relative",
  "font-serif text-3xl font-bold leading-tight",
  "text-foreground mb-8",
  "tracking-tight",
]);

/**
 * Author name with authority
 */
const testimonialAuthorVariants = cva(["font-sans text-base font-bold", "text-foreground", "tracking-wide", "mb-1"]);

/**
 * Author role/meta information - editorial small caps label
 */
const testimonialMetaVariants = cva([
  "font-sans text-xs font-semibold",
  "text-accent",
  "tracking-widest uppercase",
  "mb-6",
]);

/**
 * Optional avatar/icon wrapper
 */
const testimonialAvatarVariants = cva([
  "flex items-center justify-center",
  "w-10 h-10 mb-4",
  "rounded-full",
  "bg-accent/10 text-accent-foreground",
  "transition-all duration-300",
  "group-hover:bg-accent/20 group-hover:scale-105",
]);

export interface TestimonialsProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof testimonialsVariants> {
  children: React.ReactNode;
}

/**
 * Testimonials container component
 */
export const Testimonials = React.forwardRef<HTMLDivElement, TestimonialsProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(testimonialsVariants({ variant }), className)} {...props}>
        {children}
      </div>
    );
  }
);
Testimonials.displayName = "Testimonials";

export interface TestimonialCardProps extends React.HTMLAttributes<HTMLDivElement> {
  index?: number;
  children: React.ReactNode;
}

/**
 * Individual testimonial card component with editorial number decoration
 */
export const TestimonialCard = React.forwardRef<HTMLDivElement, TestimonialCardProps>(
  ({ className, index = 0, children, ...props }, ref) => {
    // Stagger animation delays for visual interest
    const delay = `${index * 200}ms`;
    const style = React.useMemo(() => ({ animationDelay: delay }), [delay]);
    // Format index as two-digit number (01, 02, 03...)
    const displayNumber = String(index + 1).padStart(2, "0");

    return (
      <div ref={ref} className={cn(testimonialCardVariants(), className)} style={style} {...props}>
        {/* Editorial background number */}
        <div
          className="text-accent/[0.04] pointer-events-none absolute -right-4 -top-2 select-none font-serif text-[120px] font-bold leading-none"
          aria-hidden="true"
        >
          {displayNumber}
        </div>
        {children}
      </div>
    );
  }
);
TestimonialCard.displayName = "TestimonialCard";

export interface TestimonialQuoteProps extends React.HTMLAttributes<HTMLQuoteElement> {
  children: React.ReactNode;
}

/**
 * Quote text component with large opening quotation mark
 */
export const TestimonialQuote = React.forwardRef<HTMLQuoteElement, TestimonialQuoteProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <blockquote ref={ref} className={cn(testimonialQuoteVariants(), className)} {...props}>
        {children}
      </blockquote>
    );
  }
);
TestimonialQuote.displayName = "TestimonialQuote";

export interface TestimonialAuthorProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Author name component
 */
export const TestimonialAuthor = React.forwardRef<HTMLDivElement, TestimonialAuthorProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(testimonialAuthorVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
TestimonialAuthor.displayName = "TestimonialAuthor";

export interface TestimonialMetaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Author role/meta component
 */
export const TestimonialMeta = React.forwardRef<HTMLDivElement, TestimonialMetaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(testimonialMetaVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
TestimonialMeta.displayName = "TestimonialMeta";

export interface TestimonialAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Optional avatar/icon wrapper component
 */
export const TestimonialAvatar = React.forwardRef<HTMLDivElement, TestimonialAvatarProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(testimonialAvatarVariants(), className)} {...props}>
        {children}
      </div>
    );
  }
);
TestimonialAvatar.displayName = "TestimonialAvatar";
