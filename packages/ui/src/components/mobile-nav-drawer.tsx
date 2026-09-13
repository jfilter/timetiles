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
import { useUILabels } from "../provider";

/**
 * Root component for mobile navigation drawer.
 * Wraps Radix Dialog primitive with navigation-specific defaults.
 */
const MobileNavDrawer = DialogPrimitive.Root;

/**
 * Trigger button for opening the mobile navigation drawer.
 * Renders a hamburger menu icon with cartographic styling.
 */
const MobileNavDrawerTrigger = ({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) => {
  const labels = useUILabels();
  return (
    <DialogPrimitive.Trigger
      ref={ref}
      className={cn(
        "hover:bg-primary/10 dark:hover:bg-foreground/10 rounded-sm p-2 transition-colors md:hidden",
        "text-primary dark:text-foreground",
        "focus:ring-primary/50 focus:ring-2 focus:ring-offset-2 focus:outline-none",
        className
      )}
      aria-label={labels.openNavigation}
      {...props}
    >
      {children ?? <Menu className="h-5 w-5" />}
    </DialogPrimitive.Trigger>
  );
};
MobileNavDrawerTrigger.displayName = "MobileNavDrawerTrigger";

/**
 * Overlay backdrop for the mobile navigation drawer.
 * Semi-transparent with fade animation.
 */
const MobileNavDrawerOverlay = ({ className, ref, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) => (
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
);
MobileNavDrawerOverlay.displayName = "MobileNavDrawerOverlay";

/**
 * Content container for the mobile navigation drawer.
 * Slides in from the right with atlas index styling.
 */
const MobileNavDrawerContent = ({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) => {
  const labels = useUILabels();
  return (
    <DialogPrimitive.Portal>
      <MobileNavDrawerOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-72 md:hidden",
          "bg-card dark:bg-background",
          "border-primary/20 dark:border-primary/40 border-l",
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
        <div className="border-primary/20 dark:border-primary/40 flex items-center justify-between border-b px-6 py-4">
          <DialogPrimitive.Title className="text-foreground dark:text-foreground font-serif text-lg font-semibold">
            {labels.navigation}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{labels.navigationDescription}</DialogPrimitive.Description>
          <DialogPrimitive.Close
            className={cn(
              "hover:bg-primary/10 dark:hover:bg-foreground/10 rounded-sm p-2 transition-colors",
              "text-primary dark:text-foreground",
              "focus:ring-primary/50 focus:ring-2 focus:ring-offset-2 focus:outline-none"
            )}
            aria-label={labels.closeNavigation}
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>

        {/* Navigation items container */}
        <nav className="flex-1 overflow-y-auto py-2">{children}</nav>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
};
MobileNavDrawerContent.displayName = "MobileNavDrawerContent";

/**
 * Link component for use within the mobile navigation drawer.
 * Wraps children with DialogPrimitive.Close for auto-close behavior.
 * Use this when you need to use Next.js Link or other custom link components.
 */
const MobileNavDrawerLink = ({
  className,
  active,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close> & { active?: boolean }) => (
  <DialogPrimitive.Close
    ref={ref}
    asChild
    className={cn(
      "block px-6 py-4 transition-colors",
      "font-serif text-lg",
      "text-foreground dark:text-foreground",
      "border-primary/10 dark:border-primary/20 border-b",
      "hover:bg-primary/5 dark:hover:bg-foreground/5",
      "focus:ring-primary/50 focus:ring-2 focus:outline-none focus:ring-inset",
      active && ["border-l-secondary border-l-[3px]", "bg-primary/5 dark:bg-foreground/5", "pl-[calc(1.5rem-3px)]"],
      className
    )}
    {...props}
  >
    {children}
  </DialogPrimitive.Close>
);
MobileNavDrawerLink.displayName = "MobileNavDrawerLink";

export { MobileNavDrawer, MobileNavDrawerContent, MobileNavDrawerLink, MobileNavDrawerOverlay, MobileNavDrawerTrigger };
