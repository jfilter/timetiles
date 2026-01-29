/**
 * Dialog component with cartographic design.
 *
 * Accessible modal dialog with refined borders and cartographic styling.
 * Follows shadcn/ui patterns with Radix UI primitives.
 *
 * @module
 * @category Components
 */
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@timetiles/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

// Type for Lucide React icons with React 19 compatibility
type IconComponent = React.ComponentType<{ className?: string }>;

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "duration-200",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const dialogContentVariants = cva(
  [
    "fixed z-50 grid w-full gap-4 bg-background p-6 shadow-lg",
    "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  ],
  {
    variants: {
      variant: {
        default: [
          "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
          "max-w-lg max-h-[85vh] overflow-y-auto rounded-sm border",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        ],
        wide: [
          "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
          "max-w-2xl max-h-[85vh] overflow-y-auto rounded-sm border",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        ],
        fullscreen: [
          "inset-0 max-h-none rounded-none border-0",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, VariantProps<typeof dialogContentVariants> {
  showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, variant, showCloseButton = true, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(dialogContentVariants({ variant }), className)} {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
            {React.createElement(X as IconComponent, {
              className: "h-4 w-4",
            })}
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-serif text-xl leading-none font-semibold tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-muted-foreground text-sm", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  dialogContentVariants,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
