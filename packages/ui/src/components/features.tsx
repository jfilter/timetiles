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

const featuresVariants = cva("py-24 bg-card", {
  variants: {
    layout: {
      grid: "",
      list: "",
      cards: "",
    },
  },
  defaultVariants: {
    layout: "grid",
  },
});

const Features = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & VariantProps<typeof featuresVariants>
>(({ className, layout, children, ...props }, ref) => {
  return (
    <section ref={ref} className={cn(featuresVariants({ layout, className }))} {...props}>
      <div className="container mx-auto px-6">{children}</div>
    </section>
  );
});
Features.displayName = "Features";

const FeaturesHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("mb-16 text-center", className)} {...props}>
      {children}
    </div>
  )
);
FeaturesHeader.displayName = "FeaturesHeader";

const FeaturesTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h2 ref={ref} className={cn("text-foreground font-serif text-4xl font-bold md:text-5xl", className)} {...props}>
      {children}
    </h2>
  )
);
FeaturesTitle.displayName = "FeaturesTitle";

const FeaturesDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p ref={ref} className={cn("text-muted-foreground mx-auto mt-4 max-w-2xl text-lg", className)} {...props}>
      {children}
    </p>
  )
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
  defaultVariants: {
    columns: 3,
  },
});

const FeaturesGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof featuresGridVariants>
>(({ className, columns, children, ...props }, ref) => (
  <div ref={ref} className={cn(featuresGridVariants({ columns, className }))} {...props}>
    {children}
  </div>
));
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
        primary: "",
        secondary: "",
        accent: "",
        muted: "",
        none: "",
      },
    },
    defaultVariants: {
      accent: "none",
    },
  }
);

const accentColors = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
  muted: "text-muted-foreground",
  none: "text-foreground",
};

const Feature = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof featureVariants>
>(({ className, accent = "none", children, ...props }, ref) => (
  <div ref={ref} className={cn(featureVariants({ accent, className }))} data-accent={accent} {...props}>
    {children}
  </div>
));
Feature.displayName = "Feature";

const FeatureIcon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
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
  }
);
FeatureIcon.displayName = "FeatureIcon";

const FeatureTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-foreground mb-4 font-serif text-2xl font-bold", className)} {...props}>
      {children}
    </h3>
  )
);
FeatureTitle.displayName = "FeatureTitle";

const FeatureDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p ref={ref} className={cn("text-muted-foreground leading-relaxed", className)} {...props}>
      {children}
    </p>
  )
);
FeatureDescription.displayName = "FeatureDescription";

// Context for passing accent color to FeatureIcon
const FeatureContext = React.createContext<
  { accent?: "primary" | "secondary" | "accent" | "muted" | "none" } | undefined
>(undefined);

// Wrap Feature to provide context
const FeatureWithContext = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof featureVariants>
>(({ accent = "none", children, ...props }, ref) => {
  const resolvedAccent = accent ?? "none";
  const memoizedContext = React.useMemo(() => ({ accent: resolvedAccent }), [resolvedAccent]);

  return (
    <FeatureContext.Provider value={memoizedContext}>
      <Feature ref={ref} accent={resolvedAccent} {...props}>
        {children}
      </Feature>
    </FeatureContext.Provider>
  );
});
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
