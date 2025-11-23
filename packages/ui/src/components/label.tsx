/**
 * Label component with cartographic design.
 *
 * Form label with refined typography and proper accessibility.
 * Follows shadcn/ui patterns with cartographic color tokens.
 *
 * @module
 * @category Components
 */
"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const labelVariants = cva(
  "flex select-none items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
  {
    variants: {
      variant: {
        default: "text-foreground",
        muted: "text-muted-foreground",
        error: "text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, variant, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} data-slot="label" className={cn(labelVariants({ variant, className }))} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };
