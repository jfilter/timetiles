/**
 * Collapsible component for expandable/collapsible content sections.
 *
 * Built on Radix UI Collapsible primitive following shadcn/ui patterns.
 * Provides smooth height animations for expanding/collapsing content.
 *
 * @module
 * @category Components
 */
"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import * as React from "react";

import { cn } from "../lib/utils";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) => (
  <CollapsiblePrimitive.CollapsibleTrigger
    ref={ref}
    className={cn(
      "flex w-full items-center justify-between py-4 text-sm font-medium transition-colors",
      "text-foreground hover:text-muted-foreground",
      "[&[data-state=open]>svg]:rotate-180",
      className
    )}
    {...props}
  />
);
CollapsibleTrigger.displayName = CollapsiblePrimitive.CollapsibleTrigger.displayName;

const CollapsibleContent = ({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className={cn(
      "overflow-hidden text-sm",
      "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
      className
    )}
    {...props}
  >
    {children}
  </CollapsiblePrimitive.CollapsibleContent>
);
CollapsibleContent.displayName = CollapsiblePrimitive.CollapsibleContent.displayName;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
