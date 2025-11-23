/**
 * Generic Stats component with cartographic design.
 *
 * Composable statistics/metrics display with multiple variants.
 * Follows shadcn/ui patterns for maximum flexibility.
 *
 * @module
 * @category Components
 */
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const statsVariants = cva("py-20", {
  variants: {
    variant: {
      bar: "bg-primary",
      grid: "bg-card",
      inline: "bg-background",
    },
  },
  defaultVariants: {
    variant: "bar",
  },
});

const Stats = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & VariantProps<typeof statsVariants>>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <section ref={ref} className={cn(statsVariants({ variant, className }))} {...props}>
        <div className="container mx-auto max-w-5xl px-6">{children}</div>
      </section>
    );
  }
);
Stats.displayName = "Stats";

const statsGridVariants = cva("", {
  variants: {
    columns: {
      2: "grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-8",
      3: "grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8",
      4: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8",
    },
    alignment: {
      center: "text-center",
      left: "text-left",
      right: "text-right",
    },
  },
  defaultVariants: {
    columns: 3,
    alignment: "center",
  },
});

const StatsGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof statsGridVariants>
>(({ className, columns, alignment, children, ...props }, ref) => (
  <div ref={ref} className={cn(statsGridVariants({ columns, alignment, className }))} {...props}>
    {children}
  </div>
));
StatsGrid.displayName = "StatsGrid";

// Detect parent variant for styling
const StatsContext = React.createContext<{ variant?: "bar" | "grid" | "inline" } | undefined>(undefined);

const Stat = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(StatsContext);
    const variant = context?.variant ?? "bar";

    return (
      <div ref={ref} className={cn("stat-item", className)} data-variant={variant} {...props}>
        {children}
      </div>
    );
  }
);
Stat.displayName = "Stat";

const StatValue = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(StatsContext);
    const variant = context?.variant ?? "bar";

    const variantClasses = {
      bar: "font-mono text-4xl md:text-5xl font-bold text-primary-foreground mb-2",
      grid: "font-mono text-4xl md:text-5xl font-bold text-foreground mb-2",
      inline: "font-mono text-3xl md:text-4xl font-bold text-foreground mb-1",
    };

    return (
      <div ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {children}
      </div>
    );
  }
);
StatValue.displayName = "StatValue";

const StatLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(StatsContext);
    const variant = context?.variant ?? "bar";

    const variantClasses = {
      bar: "text-primary-foreground/90 text-sm md:text-base uppercase tracking-wider",
      grid: "text-muted-foreground text-sm md:text-base uppercase tracking-wider",
      inline: "text-muted-foreground text-xs md:text-sm uppercase tracking-wide",
    };

    return (
      <div ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {children}
      </div>
    );
  }
);
StatLabel.displayName = "StatLabel";

// Wrapper to provide context
const StatsWithContext = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & VariantProps<typeof statsVariants>
>(({ variant = "bar", children, ...props }, ref) => {
  const resolvedVariant = variant ?? "bar";
  const memoizedContext = React.useMemo(() => ({ variant: resolvedVariant }), [resolvedVariant]);
  return (
    <StatsContext.Provider value={memoizedContext}>
      <Stats ref={ref} variant={resolvedVariant} {...props}>
        {children}
      </Stats>
    </StatsContext.Provider>
  );
});
StatsWithContext.displayName = "Stats";

export { Stat, StatLabel, StatsWithContext as Stats, StatsGrid, statsGridVariants, statsVariants, StatValue };
