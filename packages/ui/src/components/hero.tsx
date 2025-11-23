/**
 * Generic Hero component with cartographic design.
 *
 * Composable hero section with variants for different layouts.
 * Follows shadcn/ui patterns for maximum flexibility.
 *
 * @module
 * @category Components
 */
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const heroVariants = cva("relative flex items-center justify-center overflow-hidden bg-background", {
  variants: {
    variant: {
      centered: "text-center",
      split: "text-left",
      "full-bleed": "min-h-screen",
    },
    size: {
      default: "min-h-[70vh] py-24 md:py-32",
      sm: "min-h-[50vh] py-16 md:py-20",
      lg: "min-h-[85vh] py-32 md:py-40",
    },
    background: {
      grid: "", // Grid background applied via separate element
      solid: "",
      none: "",
    },
  },
  defaultVariants: {
    variant: "centered",
    size: "default",
    background: "grid",
  },
});

const gridBackgroundStyle = {
  backgroundImage: `
    linear-gradient(var(--color-foreground) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px),
    linear-gradient(var(--color-foreground) 0.5px, transparent 0.5px),
    linear-gradient(90deg, var(--color-foreground) 0.5px, transparent 0.5px)
  `,
  backgroundSize: "60px 60px, 60px 60px, 20px 20px, 20px 20px",
};

const Hero = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & VariantProps<typeof heroVariants>>(
  ({ className, variant, size, background, children, ...props }, ref) => {
    return (
      <section ref={ref} className={cn(heroVariants({ variant, size, background, className }))} {...props}>
        {/* Subtle grid background */}
        {background === "grid" && (
          <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08]" style={gridBackgroundStyle} />
        )}

        {/* Content container */}
        <div className="container relative z-10 mx-auto w-full max-w-5xl px-6">{children}</div>
      </section>
    );
  }
);
Hero.displayName = "Hero";

const HeroLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("mb-12 flex justify-center", className)} {...props}>
      {children}
    </div>
  )
);
HeroLogo.displayName = "HeroLogo";

const HeroHeadline = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(
        "text-foreground mb-6 font-serif text-5xl font-bold leading-tight tracking-tight md:text-7xl",
        className
      )}
      {...props}
    >
      {children}
    </h1>
  )
);
HeroHeadline.displayName = "HeroHeadline";

const HeroSubheadline = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed md:text-2xl", className)}
      {...props}
    >
      {children}
    </p>
  )
);
HeroSubheadline.displayName = "HeroSubheadline";

const HeroActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("mt-12 flex flex-wrap justify-center gap-4", className)} {...props}>
      {children}
    </div>
  )
);
HeroActions.displayName = "HeroActions";

const HeroAccent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-12 flex justify-center gap-2", className)} {...props}>
      <div className="bg-primary h-1 w-16 rounded-full" />
      <div className="bg-secondary h-1 w-4 rounded-full" />
      <div className="bg-accent h-1 w-8 rounded-full" />
    </div>
  )
);
HeroAccent.displayName = "HeroAccent";

export { Hero, HeroAccent, HeroActions, HeroHeadline, HeroLogo, HeroSubheadline, heroVariants };
