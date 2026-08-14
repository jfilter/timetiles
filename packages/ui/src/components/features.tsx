"use client";

/**
 * Generic Features component with cartographic design.
 *
 * Composable features section with multiple layout variants.
 * Follows shadcn/ui patterns for maximum flexibility.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const featuresVariants = cva("py-24", {
  variants: { layout: { grid: "bg-card", list: "bg-background", cards: "bg-muted/30" } },
  defaultVariants: { layout: "grid" },
});

const Features = ({
  className,
  layout,
  children,
  ref,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof featuresVariants>) => {
  return (
    <section ref={ref} className={cn(featuresVariants({ layout, className }))} {...props}>
      <div className="container mx-auto px-6">{children}</div>
    </section>
  );
};
Features.displayName = "Features";

const FeaturesHeader = ({ className, children, ref, ...props }: React.ComponentProps<"div">) => (
  <div ref={ref} className={cn("mb-16 text-center", className)} {...props}>
    {children}
  </div>
);
FeaturesHeader.displayName = "FeaturesHeader";

const FeaturesTitle = ({ className, children, ref, ...props }: React.ComponentProps<"h2">) => (
  <h2 ref={ref} className={cn("text-foreground font-serif text-4xl font-bold md:text-5xl", className)} {...props}>
    {children}
  </h2>
);
FeaturesTitle.displayName = "FeaturesTitle";

const FeaturesDescription = ({ className, children, ref, ...props }: React.ComponentProps<"p">) => (
  <p ref={ref} className={cn("text-muted-foreground mx-auto mt-4 max-w-2xl text-lg", className)} {...props}>
    {children}
  </p>
);
FeaturesDescription.displayName = "FeaturesDescription";

const featuresGridVariants = cva("", {
  variants: {
    columns: {
      1: "grid grid-cols-1 gap-12",
      2: "grid grid-cols-1 md:grid-cols-2 gap-12",
      3: "grid grid-cols-1 md:grid-cols-3 gap-12",
      4: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12",
    },
  },
  defaultVariants: { columns: 3 },
});

const FeaturesGrid = ({
  className,
  columns,
  children,
  ref,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof featuresGridVariants>) => (
  <div ref={ref} className={cn(featuresGridVariants({ columns, className }))} {...props}>
    {children}
  </div>
);
FeaturesGrid.displayName = "FeaturesGrid";

const featureVariants = cva(
  [
    "group relative text-center",
    "p-8 rounded-sm",
    "bg-card border-2 border-accent/20",
    "transition-all duration-500",
    "hover:shadow-xl hover:border-accent/40 hover:-translate-y-1",
    "hover:bg-accent/[0.02]",
  ],
  {
    variants: {
      accent: {
        primary: "border-primary/20 hover:border-primary/40",
        secondary: "border-secondary/20 hover:border-secondary/40",
        accent: "border-accent/20 hover:border-accent/40",
        muted: "border-muted/30 hover:border-muted/50",
        none: "",
      },
    },
    defaultVariants: { accent: "none" },
  }
);

const accentColors = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
  muted: "text-muted-foreground",
  none: "text-foreground",
};

const Feature = ({
  className,
  accent = "none",
  children,
  ref,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof featureVariants>) => (
  <div ref={ref} className={cn(featureVariants({ accent, className }))} data-accent={accent} {...props}>
    {children}
  </div>
);
Feature.displayName = "Feature";

const FeatureIcon = ({ className, children, ref, ...props }: React.ComponentProps<"div">) => {
  const parent = React.useContext(FeatureContext);
  const accent = parent?.accent ?? "none";

  return (
    <div
      ref={ref}
      className={cn(
        "mb-6 flex justify-center text-6xl transition-transform duration-300 group-hover:scale-110",
        accentColors[accent],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
FeatureIcon.displayName = "FeatureIcon";

const FeatureTitle = ({ className, children, ref, ...props }: React.ComponentProps<"h3">) => (
  <h3 ref={ref} className={cn("text-foreground mb-4 font-serif text-2xl font-bold", className)} {...props}>
    {children}
  </h3>
);
FeatureTitle.displayName = "FeatureTitle";

const FeatureDescription = ({ className, children, ref, ...props }: React.ComponentProps<"p">) => (
  <p ref={ref} className={cn("text-muted-foreground leading-relaxed", className)} {...props}>
    {children}
  </p>
);
FeatureDescription.displayName = "FeatureDescription";

// Context for passing accent color to FeatureIcon
const FeatureContext = React.createContext<
  { accent?: "primary" | "secondary" | "accent" | "muted" | "none" } | undefined
>(undefined);

// Wrap Feature to provide context
const FeatureWithContext = ({
  accent = "none",
  children,
  ref,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof featureVariants>) => {
  const resolvedAccent = accent ?? "none";

  return (
    <FeatureContext.Provider value={{ accent: resolvedAccent }}>
      <Feature ref={ref} accent={resolvedAccent} {...props}>
        {children}
      </Feature>
    </FeatureContext.Provider>
  );
};
FeatureWithContext.displayName = "Feature";

export {
  FeatureWithContext as Feature,
  FeatureDescription,
  FeatureIcon,
  Features,
  FeaturesDescription,
  FeaturesGrid,
  featuresGridVariants,
  FeaturesHeader,
  FeaturesTitle,
  featuresVariants,
  FeatureTitle,
  featureVariants,
};
