/**
 * Generic Call-to-Action component with cartographic design.
 *
 * Composable CTA section with multiple layout variants.
 * Follows shadcn/ui patterns for maximum flexibility.
 *
 * @module
 * @category Components
 */
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const callToActionVariants = cva("py-24", {
  variants: {
    variant: {
      centered: "bg-background",
      split: "bg-card",
      banner: "bg-primary",
    },
  },
  defaultVariants: {
    variant: "centered",
  },
});

const CallToAction = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & VariantProps<typeof callToActionVariants>
>(({ className, variant, children, ...props }, ref) => {
  return (
    <section ref={ref} className={cn(callToActionVariants({ variant, className }))} {...props}>
      <div className="container mx-auto max-w-4xl px-6">{children}</div>
    </section>
  );
});
CallToAction.displayName = "CallToAction";

// Context for passing variant to child components
const CallToActionContext = React.createContext<{ variant?: "centered" | "split" | "banner" } | undefined>(undefined);

const callToActionContentVariants = cva("", {
  variants: {
    variant: {
      centered: "text-center",
      split: "grid grid-cols-1 md:grid-cols-2 gap-12 items-center",
      banner: "text-center",
    },
  },
  defaultVariants: {
    variant: "centered",
  },
});

const CallToActionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(CallToActionContext);
    const variant = context?.variant ?? "centered";

    return (
      <div ref={ref} className={cn(callToActionContentVariants({ variant, className }))} {...props}>
        {children}
      </div>
    );
  }
);
CallToActionContent.displayName = "CallToActionContent";

const CallToActionHeadline = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(CallToActionContext);
    const variant = context?.variant ?? "centered";

    const variantClasses = {
      centered: "font-serif text-4xl md:text-5xl font-bold text-foreground mb-12 leading-tight",
      split: "font-serif text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight",
      banner: "font-serif text-4xl md:text-5xl font-bold text-primary-foreground mb-12 leading-tight",
    };

    return (
      <h2 ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {children}
      </h2>
    );
  }
);
CallToActionHeadline.displayName = "CallToActionHeadline";

const CallToActionDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(CallToActionContext);
    const variant = context?.variant ?? "centered";

    const variantClasses = {
      centered: "text-lg text-muted-foreground mb-8 max-w-2xl mx-auto",
      split: "text-base text-muted-foreground mb-6",
      banner: "text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto",
    };

    return (
      <p ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {children}
      </p>
    );
  }
);
CallToActionDescription.displayName = "CallToActionDescription";

const CallToActionActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(CallToActionContext);
    const variant = context?.variant ?? "centered";

    const variantClasses = {
      centered: "flex justify-center gap-4 flex-wrap",
      split: "flex gap-4 flex-wrap",
      banner: "flex justify-center gap-4 flex-wrap",
    };

    return (
      <div ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {children}
      </div>
    );
  }
);
CallToActionActions.displayName = "CallToActionActions";

const CallToActionFootnote = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(CallToActionContext);
    const variant = context?.variant ?? "centered";

    const variantClasses = {
      centered: "mt-8 text-muted-foreground text-sm",
      split: "mt-6 text-muted-foreground text-sm",
      banner: "mt-8 text-primary-foreground/70 text-sm",
    };

    return (
      <p ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {children}
      </p>
    );
  }
);
CallToActionFootnote.displayName = "CallToActionFootnote";

// Wrapper to provide context
const CallToActionWithContext = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & VariantProps<typeof callToActionVariants>
>(({ variant = "centered", children, ...props }, ref) => {
  const resolvedVariant = variant ?? "centered";
  const memoizedContext = React.useMemo(() => ({ variant: resolvedVariant }), [resolvedVariant]);
  return (
    <CallToActionContext.Provider value={memoizedContext}>
      <CallToAction ref={ref} variant={resolvedVariant} {...props}>
        {children}
      </CallToAction>
    </CallToActionContext.Provider>
  );
});
CallToActionWithContext.displayName = "CallToAction";

export {
  CallToActionWithContext as CallToAction,
  CallToActionActions,
  CallToActionContent,
  CallToActionDescription,
  CallToActionFootnote,
  CallToActionHeadline,
  callToActionVariants,
};
