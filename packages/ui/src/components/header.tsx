/**
 * Header component for cartographic-themed applications.
 *
 * Provides sticky top navigation with marketing and app variants.
 * Features full-width edge-to-edge design, backdrop blur, and optional
 * cartographic decorative elements (grid overlay, coordinates, compass).
 *
 * @module
 * @category Components
 */

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { headerGridStyle } from "../lib/grid-backgrounds";
import { cn } from "../lib/utils";

const headerVariants = cva("sticky top-0 z-50 w-full border-b backdrop-blur-sm transition-all duration-200", {
  variants: {
    variant: {
      marketing: "bg-card/95 border-primary/20 dark:bg-background/95 dark:border-primary/40",
      app: "bg-background/95 border-primary/30 dark:bg-card/95 dark:border-primary/50",
    },
    decorative: { true: "relative overflow-hidden", false: "" },
  },
  defaultVariants: { variant: "marketing", decorative: false },
});

export interface HeaderProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof headerVariants> {
  /**
   * Whether to show cartographic decorative elements
   * (grid overlay, coordinates, compass)
   */
  decorative?: boolean;
}

/**
 * Main header component with sticky positioning and cartographic styling.
 *
 * @example
 * ```tsx
 * <Header variant="marketing" decorative>
 *   <HeaderBrand>
 *     <Logo />
 *   </HeaderBrand>
 *   <HeaderNav>
 *     <HeaderNavItem href="/">Home</HeaderNavItem>
 *   </HeaderNav>
 *   <HeaderActions>
 *     <ThemeToggle />
 *   </HeaderActions>
 * </Header>
 * ```
 */
const Header = React.forwardRef<HTMLElement, HeaderProps>(
  ({ className, variant, decorative, children, ...props }, ref) => {
    return (
      <header ref={ref} className={cn(headerVariants({ variant, decorative }), className)} {...props}>
        {/* Cartographic grid overlay (when decorative) */}
        {decorative && (
          <div className="absolute inset-0 opacity-100 dark:opacity-50" style={headerGridStyle} aria-hidden="true" />
        )}

        {/* Content container */}
        <div className="relative mx-auto flex h-12 items-center justify-between px-6 md:px-8">{children}</div>
      </header>
    );
  }
);

Header.displayName = "Header";

export { Header, headerVariants };
