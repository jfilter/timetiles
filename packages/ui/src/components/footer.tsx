"use client";

/**
 * Cartographic Footer component with vintage map aesthetics.
 *
 * Design direction: Refined cartographic elegance with vintage map textures,
 * coordinate grid overlays, and editorial typography that evokes antique atlases.
 *
 * Key aesthetic choices:
 * - Parchment-toned background with subtle texture
 * - Compass rose decorative elements
 * - Grid coordinates overlay for spatial context
 * - Playfair Display for headings (map title feel)
 * - DM Sans for body (modern legibility)
 * - Navy and terracotta accents from topographic maps
 *
 * @module
 * @category Components
 */
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const footerVariants = cva(
  "relative border-t border-charcoal/20 bg-gradient-to-b from-parchment/30 via-parchment/20 to-background overflow-hidden",
  {
    variants: {
      size: {
        default: "py-24",
        sm: "py-16",
        lg: "py-32",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const gridOverlayStyle = {
  backgroundImage: `
    linear-gradient(to right, currentColor 1px, transparent 1px),
    linear-gradient(to bottom, currentColor 1px, transparent 1px)
  `,
  backgroundSize: "60px 60px",
};

const Footer = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & VariantProps<typeof footerVariants>>(
  ({ className, size, children, ...props }, ref) => {
    return (
      <footer ref={ref} className={cn(footerVariants({ size }), className)} {...props}>
        {/* Subtle grid overlay for cartographic feel */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={gridOverlayStyle} />

        {/* Decorative corner coordinates */}
        <div className="text-charcoal/30 pointer-events-none absolute left-8 top-8 font-mono text-[10px] tracking-widest">
          40.7128°N, 74.0060°W
        </div>
        <div className="text-charcoal/30 pointer-events-none absolute right-8 top-8 font-mono text-[10px] tracking-widest">
          SCALE 1:1,000,000
        </div>

        <div className="container relative mx-auto max-w-7xl px-8">{children}</div>
      </footer>
    );
  }
);
Footer.displayName = "Footer";

const footerContentVariants = cva("mb-12", {
  variants: {
    columns: {
      1: "grid grid-cols-1 gap-12",
      2: "grid grid-cols-1 md:grid-cols-2 gap-12",
      3: "grid grid-cols-1 md:grid-cols-3 gap-12",
    },
  },
  defaultVariants: {
    columns: 3,
  },
});

const FooterContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof footerContentVariants>
>(({ className, columns, children, ...props }, ref) => (
  <div ref={ref} className={cn(footerContentVariants({ columns }), className)} {...props}>
    {children}
  </div>
));
FooterContent.displayName = "FooterContent";

const FooterColumn = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  )
);
FooterColumn.displayName = "FooterColumn";

const FooterBrand = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative", className)} {...props}>
      {/* Decorative compass rose in background */}
      <div className="pointer-events-none absolute -left-4 -top-4 h-32 w-32 opacity-[0.04]">
        <svg viewBox="0 0 100 100" fill="currentColor">
          <circle cx="50" cy="50" r="2" />
          <path d="M50 10 L52 48 L50 50 L48 48 Z" />
          <path d="M90 50 L52 52 L50 50 L52 48 Z" />
          <path d="M50 90 L48 52 L50 50 L52 52 Z" />
          <path d="M10 50 L48 48 L50 50 L48 52 Z" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="0.3" />
        </svg>
      </div>
      {children}
    </div>
  )
);
FooterBrand.displayName = "FooterBrand";

const FooterLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("mb-6", className)} {...props}>
      {children}
    </div>
  )
);
FooterLogo.displayName = "FooterLogo";

const FooterTagline = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-charcoal/70 dark:text-parchment/70 max-w-md text-base leading-relaxed", className)}
      {...props}
    >
      {children}
    </p>
  )
);
FooterTagline.displayName = "FooterTagline";

const FooterSection = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  )
);
FooterSection.displayName = "FooterSection";

const FooterSectionTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "text-navy dark:text-parchment mb-6 font-serif text-sm font-bold uppercase tracking-[0.2em]",
        "relative pb-2",
        "after:bg-terracotta/40 after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-8",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  )
);
FooterSectionTitle.displayName = "FooterSectionTitle";

const FooterLinks = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, children, ...props }, ref) => (
    <ul ref={ref} className={cn("space-y-3.5", className)} {...props}>
      {children}
    </ul>
  )
);
FooterLinks.displayName = "FooterLinks";

const FooterLink = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, children, ...props }, ref) => (
    <li
      ref={ref}
      className={cn(
        "text-charcoal/60 text-[15px] leading-relaxed transition-all duration-200",
        "hover:text-navy dark:text-parchment/60 dark:hover:text-parchment hover:translate-x-1",
        "group relative",
        className
      )}
      {...props}
    >
      <span className="absolute -left-3 opacity-0 transition-opacity group-hover:opacity-100">→</span>
      {children}
    </li>
  )
);
FooterLink.displayName = "FooterLink";

const FooterBottom = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "border-charcoal/10 relative mt-16 border-t pt-10",
        "before:via-terracotta/20 before:absolute before:left-0 before:top-0 before:h-[1px] before:w-full before:bg-gradient-to-r before:from-transparent before:to-transparent",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
FooterBottom.displayName = "FooterBottom";

const FooterBottomContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col items-center justify-between gap-6 md:flex-row", className)} {...props}>
      {children}
    </div>
  )
);
FooterBottomContent.displayName = "FooterBottomContent";

const FooterCopyright = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-charcoal/50 dark:text-parchment/50 text-sm", "font-mono tracking-wide", className)}
      {...props}
    >
      {children}
    </p>
  )
);
FooterCopyright.displayName = "FooterCopyright";

const FooterCredits = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-charcoal/40 dark:text-parchment/40 text-xs", "font-mono tracking-wider", className)}
      {...props}
    >
      {children}
    </p>
  )
);
FooterCredits.displayName = "FooterCredits";

export {
  Footer,
  FooterBottom,
  FooterBottomContent,
  FooterBrand,
  FooterColumn,
  FooterContent,
  footerContentVariants,
  FooterCopyright,
  FooterCredits,
  FooterLink,
  FooterLinks,
  FooterLogo,
  FooterSection,
  FooterSectionTitle,
  FooterTagline,
  footerVariants,
};
