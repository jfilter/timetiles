/**
 * HeaderBrand component for logo and brand identity.
 *
 * Composable subcomponent for the left side of the Header.
 * Typically contains logo, wordmark, or site title with link to homepage.
 *
 * @module
 * @category Components
 */

import * as React from "react";

import { cn } from "../lib/utils";

export interface HeaderBrandProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Brand content (logo, wordmark, etc.)
   */
  children: React.ReactNode;
}

/**
 * Brand/logo section for the header (left side).
 *
 * @example
 * ```tsx
 * <HeaderBrand>
 *   <Link href="/">
 *     <Logo />
 *     <span className="font-serif text-xl font-bold">TimeTiles</span>
 *   </Link>
 * </HeaderBrand>
 * ```
 */
const HeaderBrand = React.forwardRef<HTMLDivElement, HeaderBrandProps>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-3",
        "font-serif text-xl font-bold",
        "text-cartographic-charcoal dark:text-cartographic-parchment",
        "transition-transform duration-200 hover:scale-105",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

HeaderBrand.displayName = "HeaderBrand";

export { HeaderBrand };
