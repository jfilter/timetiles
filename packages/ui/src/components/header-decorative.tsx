/**
 * HeaderDecorative component for cartographic visual enhancements.
 *
 * Optional decorative elements that add cartographic authenticity:
 * - Grid overlay (survey map grid pattern)
 * - Coordinate display (lat/long style numbers)
 * - Compass rose (micro-rotation on scroll)
 *
 * @module
 * @category Components
 */

"use client";

import * as React from "react";

import { cn } from "../lib/utils";

export interface HeaderDecorativeProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Type of decorative element
   */
  variant: "grid" | "coordinates" | "compass";
  /**
   * Position for coordinates (optional)
   */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const gridStyle: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(to right, oklch(0.35 0.06 250 / 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, oklch(0.35 0.06 250 / 0.05) 1px, transparent 1px)
  `,
  backgroundSize: "40px 40px",
};

/**
 * Cartographic decorative elements for the header.
 *
 * @example
 * ```tsx
 * <HeaderDecorative variant="grid" />
 * <HeaderDecorative variant="coordinates" position="top-right" />
 * <HeaderDecorative variant="compass" />
 * ```
 */
const HeaderDecorative = React.forwardRef<HTMLDivElement, HeaderDecorativeProps>(
  ({ className, variant, position = "top-right", ...props }, ref) => {
    const [scrollY, setScrollY] = React.useState(0);

    // Always call hooks unconditionally
    React.useEffect(() => {
      if (variant !== "compass" && variant !== "coordinates") return;

      const handleScroll = () => {
        setScrollY(window.scrollY);
      };

      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }, [variant]);

    // Memoize compass style (always called, only used when variant is compass)
    const compassStyle: React.CSSProperties = React.useMemo(
      () => ({
        transform: `translateY(-50%) rotate(${scrollY * 0.1}deg)`,
      }),
      [scrollY]
    );

    if (variant === "grid") {
      return (
        <div
          ref={ref}
          className={cn("absolute inset-0 opacity-100 dark:opacity-50", className)}
          style={gridStyle}
          aria-hidden="true"
          {...props}
        />
      );
    }

    if (variant === "coordinates") {
      // Simulate coordinate change based on scroll (playful interaction)
      const baseLatitude = 40.7128;
      const baseLongitude = -74.006;
      const latOffset = (scrollY * 0.001) % 0.1;
      const lonOffset = (scrollY * 0.0015) % 0.1;

      const latitude = baseLatitude + latOffset;
      const longitude = baseLongitude + lonOffset;

      const latDir = latitude >= 0 ? "N" : "S";
      const lonDir = longitude >= 0 ? "E" : "W";

      const positionClasses = {
        "top-left": "top-4 left-4",
        "top-right": "top-4 right-4",
        "bottom-left": "bottom-4 left-4",
        "bottom-right": "bottom-4 right-4",
      };

      return (
        <div
          ref={ref}
          className={cn(
            "absolute z-10",
            "font-mono text-xs",
            "text-cartographic-navy/40 dark:text-cartographic-parchment/30",
            "pointer-events-none select-none",
            positionClasses[position],
            className
          )}
          aria-hidden="true"
          {...props}
        >
          {Math.abs(latitude).toFixed(4)}°{latDir}, {Math.abs(longitude).toFixed(4)}°{lonDir}
        </div>
      );
    }

    if (variant === "compass") {
      return (
        <div
          ref={ref}
          className={cn(
            "absolute right-24 top-1/2 -translate-y-1/2",
            "pointer-events-none select-none",
            "opacity-30 dark:opacity-20",
            "transition-transform duration-300 ease-out",
            className
          )}
          style={compassStyle}
          aria-hidden="true"
          {...props}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-cartographic-navy dark:text-cartographic-parchment"
          >
            <path d="M12 2L14 10L12 12L10 10L12 2Z" fill="currentColor" fillOpacity="0.8" />
            <path d="M12 22L10 14L12 12L14 14L12 22Z" fill="currentColor" fillOpacity="0.3" />
            <path d="M2 12L10 10L12 12L10 14L2 12Z" fill="currentColor" fillOpacity="0.5" />
            <path d="M22 12L14 14L12 12L14 10L22 12Z" fill="currentColor" fillOpacity="0.5" />
          </svg>
        </div>
      );
    }

    return null;
  }
);

HeaderDecorative.displayName = "HeaderDecorative";

export { HeaderDecorative };
