/**
 * Cartographic-themed card component.
 *
 * Provides elegant content containers with refined typography
 * and subtle borders inspired by map design.
 *
 * @module
 * @category Components
 */
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const cardVariants = cva("rounded-sm border transition-all duration-200", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground border-border",
      elevated: "bg-card text-card-foreground border-border shadow-md hover:shadow-lg hover:-translate-y-1",
      outline: "bg-transparent text-foreground border-border",
      ghost: "bg-muted/50 text-foreground border-transparent",
      // New variant inspired by logo preview cards
      showcase:
        "bg-background dark:bg-card text-card-foreground border-2 border-cartographic-navy dark:border-border shadow-sm hover:shadow-lg hover:-translate-y-1",
    },
    padding: {
      none: "",
      sm: "p-4",
      default: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "default",
  },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, padding, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col space-y-2", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-foreground font-serif text-2xl font-bold leading-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-muted-foreground leading-relaxed", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("border-border flex items-center border-t pt-4", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

/**
 * CardVersion - Small version/tag label for cards
 *
 * Usage: <CardVersion>Version 1</CardVersion>
 */
const CardVersion = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "text-cartographic-blue dark:text-cartographic-blue mb-2 font-mono text-xs font-bold uppercase tracking-wide",
        className
      )}
      {...props}
    />
  )
);
CardVersion.displayName = "CardVersion";

/**
 * CardLabel - Small muted label for sections within cards
 *
 * Usage: <CardLabel>Light Background</CardLabel>
 */
const CardLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide opacity-60", className)}
      {...props}
    />
  )
);
CardLabel.displayName = "CardLabel";

/**
 * CardSpec - Grid of specification items (2-column layout)
 *
 * Usage:
 * <CardSpec>
 *   <CardSpecItem label="Dimensions">420×120px</CardSpecItem>
 *   <CardSpecItem label="Format">Landscape</CardSpecItem>
 * </CardSpec>
 */
const CardSpec = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-4 grid grid-cols-2 gap-3", className)} {...props} />
  )
);
CardSpec.displayName = "CardSpec";

/**
 * CardSpecItem - Individual specification item with label and value
 *
 * Usage: <CardSpecItem label="Dimensions">420×120px</CardSpecItem>
 */
interface CardSpecItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
}

const CardSpecItem = React.forwardRef<HTMLDivElement, CardSpecItemProps>(
  ({ className, label, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "from-cartographic-parchment to-cartographic-cream dark:from-muted dark:to-muted/50 border-cartographic-blue dark:border-primary rounded-sm border-l-2 bg-gradient-to-br p-3",
        className
      )}
      {...props}
    >
      <div className="text-foreground mb-1 text-[0.625rem] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-muted-foreground text-sm">{children}</div>
    </div>
  )
);
CardSpecItem.displayName = "CardSpecItem";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardLabel,
  CardSpec,
  CardSpecItem,
  CardTitle,
  cardVariants,
  CardVersion,
};
