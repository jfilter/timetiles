/**
 * HeaderNav component for navigation menu.
 *
 * Composable subcomponent for the center of the Header.
 * Contains navigation links with cartographic styling and hover states.
 *
 * @module
 * @category Components
 */

import * as React from "react";

import { cn } from "../lib/utils";

export interface HeaderNavProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Navigation items (typically HeaderNavItem components or links)
   */
  children: React.ReactNode;
}

/**
 * Navigation menu container (center of header).
 *
 * Hidden on mobile (<md), shown in hamburger menu or on larger screens.
 *
 * @example
 * ```tsx
 * <HeaderNav>
 *   <HeaderNavItem href="/features">Features</HeaderNavItem>
 *   <HeaderNavItem href="/about">About</HeaderNavItem>
 * </HeaderNav>
 * ```
 */
const HeaderNav = React.forwardRef<HTMLElement, HeaderNavProps>(({ className, children, ...props }, ref) => {
  return (
    <nav
      ref={ref}
      className={cn("hidden md:flex md:items-center md:gap-8", "font-sans text-sm tracking-wide", className)}
      {...props}
    >
      {children}
    </nav>
  );
});

HeaderNav.displayName = "HeaderNav";

export interface HeaderNavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /**
   * Whether this is the active/current page
   */
  active?: boolean;
}

/**
 * Individual navigation link item.
 *
 * @example
 * ```tsx
 * <HeaderNavItem href="/features" active>
 *   Features
 * </HeaderNavItem>
 * ```
 */
const HeaderNavItem = React.forwardRef<HTMLAnchorElement, HeaderNavItemProps>(
  ({ className, active, children, ...props }, ref) => {
    return (
      <a
        ref={ref}
        className={cn(
          "relative font-sans text-sm tracking-wide transition-colors duration-200",
          "text-cartographic-navy dark:text-cartographic-charcoal/80",
          "hover:text-cartographic-blue dark:hover:text-cartographic-blue",
          "dark:focus:ring-offset-background focus:ring-cartographic-blue focus:outline-none focus:ring-2 focus:ring-offset-2",
          active &&
            "text-cartographic-blue dark:text-cartographic-blue after:bg-cartographic-blue dark:after:bg-cartographic-blue after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5",
          className
        )}
        {...props}
      >
        {children}
      </a>
    );
  }
);

HeaderNavItem.displayName = "HeaderNavItem";

export { HeaderNav, HeaderNavItem };
