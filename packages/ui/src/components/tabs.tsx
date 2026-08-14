/**
 * Tabs component following shadcn/ui patterns.
 *
 * Built on Radix UI Tabs primitive with consistent styling.
 *
 * @module
 * @category Components
 */
"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@timetiles/ui/lib/utils";
import * as React from "react";

const Tabs = TabsPrimitive.Root;

const TabsList = ({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("border-border inline-flex h-10 items-center justify-center gap-1 border-b", className)}
    {...props}
  />
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = ({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "text-muted-foreground inline-flex items-center justify-center px-4 py-2 text-sm font-medium whitespace-nowrap transition-all",
      "border-b-2 border-transparent",
      "hover:text-foreground hover:bg-muted/50 rounded-t-md",
      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:border-primary data-[state=active]:text-primary",
      className
    )}
    {...props}
  />
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = ({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none", className)}
    {...props}
  />
);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
