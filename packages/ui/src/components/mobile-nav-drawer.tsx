/**
 * Mobile navigation drawer component with cartographic styling.
 *
 * Provides a slide-in drawer from the right for mobile navigation,
 * styled to feel like an atlas index page with serif typography
 * and cartographic visual elements.
 *
 * @module
 * @category Components
 */
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Root component for mobile navigation drawer.
 * Wraps Radix Dialog primitive with navigation-specific defaults.
 */
const MobileNavDrawer = DialogPrimitive.Root;

/**
 * Trigger button for opening the mobile navigation drawer.
 * Renders a hamburger menu icon with cartographic styling.
 */
const MobileNavDrawerTrigger = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Trigger
    ref={ref}
    className={cn(
      "hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm p-2 transition-colors md:hidden",
      "text-cartographic-navy dark:text-cartographic-charcoal",
      "focus:ring-cartographic-navy/50 focus:outline-none focus:ring-2 focus:ring-offset-2",
      className
    )}
    aria-label="Open navigation menu"
    {...props}
  >
    {children ?? <Menu className="h-5 w-5" />}
  </DialogPrimitive.Trigger>
));
MobileNavDrawerTrigger.displayName = "MobileNavDrawerTrigger";

/**
 * Overlay backdrop for the mobile navigation drawer.
 * Semi-transparent with fade animation.
 */
const MobileNavDrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 md:hidden",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      className
    )}
    {...props}
  />
));
MobileNavDrawerOverlay.displayName = "MobileNavDrawerOverlay";

/**
 * Content container for the mobile navigation drawer.
 * Slides in from the right with atlas index styling.
 */
const MobileNavDrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <MobileNavDrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 w-72 md:hidden",
        "bg-cartographic-cream dark:bg-cartographic-parchment",
        "border-cartographic-navy/20 dark:border-cartographic-navy/40 border-l",
        "shadow-2xl",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        "duration-300 ease-out",
        "flex flex-col",
        className
      )}
      {...props}
    >
      {/* Header with close button */}
      <div className="border-cartographic-navy/20 dark:border-cartographic-navy/40 flex items-center justify-between border-b px-6 py-4">
        <DialogPrimitive.Title className="text-cartographic-charcoal dark:text-cartographic-charcoal font-serif text-lg font-semibold">
          Navigation
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">Site navigation menu</DialogPrimitive.Description>
        <DialogPrimitive.Close
          className={cn(
            "hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm p-2 transition-colors",
            "text-cartographic-navy dark:text-cartographic-charcoal",
            "focus:ring-cartographic-navy/50 focus:outline-none focus:ring-2 focus:ring-offset-2"
          )}
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>

      {/* Navigation items container */}
      <nav className="flex-1 overflow-y-auto py-2">{children}</nav>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
MobileNavDrawerContent.displayName = "MobileNavDrawerContent";

interface MobileNavDrawerItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Whether this item represents the current page */
  active?: boolean;
  /** Component to use for rendering the link (e.g., Next.js Link) */
  asChild?: boolean;
}

/**
 * Navigation item within the mobile drawer.
 * Styled with serif typography and terracotta active indicator.
 */
const MobileNavDrawerItem = React.forwardRef<HTMLAnchorElement, MobileNavDrawerItemProps>(
  ({ className, active, children, ...props }, ref) => (
    <DialogPrimitive.Close asChild>
      <a
        ref={ref}
        className={cn(
          "block px-6 py-4 transition-colors",
          "font-serif text-lg",
          "text-cartographic-charcoal dark:text-cartographic-charcoal",
          "border-cartographic-navy/10 dark:border-cartographic-navy/20 border-b",
          "hover:bg-cartographic-navy/5 dark:hover:bg-cartographic-charcoal/5",
          "focus:ring-cartographic-navy/50 focus:outline-none focus:ring-2 focus:ring-inset",
          active && [
            "border-l-cartographic-terracotta border-l-[3px]",
            "bg-cartographic-navy/5 dark:bg-cartographic-charcoal/5",
            "pl-[calc(1.5rem-3px)]",
          ],
          className
        )}
        aria-current={active ? "page" : undefined}
        {...props}
      >
        {children}
      </a>
    </DialogPrimitive.Close>
  )
);
MobileNavDrawerItem.displayName = "MobileNavDrawerItem";

/**
 * Link component for use within the mobile navigation drawer.
 * Wraps children with DialogPrimitive.Close for auto-close behavior.
 * Use this when you need to use Next.js Link or other custom link components.
 */
const MobileNavDrawerLink = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & { active?: boolean }
>(({ className, active, children, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    asChild
    className={cn(
      "block px-6 py-4 transition-colors",
      "font-serif text-lg",
      "text-cartographic-charcoal dark:text-cartographic-charcoal",
      "border-cartographic-navy/10 dark:border-cartographic-navy/20 border-b",
      "hover:bg-cartographic-navy/5 dark:hover:bg-cartographic-charcoal/5",
      "focus:ring-cartographic-navy/50 focus:outline-none focus:ring-2 focus:ring-inset",
      active && [
        "border-l-cartographic-terracotta border-l-[3px]",
        "bg-cartographic-navy/5 dark:bg-cartographic-charcoal/5",
        "pl-[calc(1.5rem-3px)]",
      ],
      className
    )}
    {...props}
  >
    {children}
  </DialogPrimitive.Close>
));
MobileNavDrawerLink.displayName = "MobileNavDrawerLink";

export {
  MobileNavDrawer,
  MobileNavDrawerContent,
  MobileNavDrawerItem,
  MobileNavDrawerLink,
  MobileNavDrawerOverlay,
  MobileNavDrawerTrigger,
};
