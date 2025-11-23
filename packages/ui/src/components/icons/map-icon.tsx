/**
 * Map Icon - Interactive Maps feature
 *
 * Cartographic-style icon featuring a map with coordinate grid
 * and location pin marker.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const MapIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 64, className, ...props }, ref) => (
  <svg
    ref={ref}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Map background with coordinate grid */}
    <rect x="8" y="12" width="48" height="40" rx="2" />

    {/* Vertical grid lines */}
    <line x1="20" y1="12" x2="20" y2="52" opacity="0.3" />
    <line x1="32" y1="12" x2="32" y2="52" opacity="0.3" />
    <line x1="44" y1="12" x2="44" y2="52" opacity="0.3" />

    {/* Horizontal grid lines */}
    <line x1="8" y1="24" x2="56" y2="24" opacity="0.3" />
    <line x1="8" y1="36" x2="56" y2="36" opacity="0.3" />

    {/* Topographic contour lines (abstract landscape) */}
    <path d="M 12 28 Q 20 26 28 28 T 44 28" opacity="0.5" />
    <path d="M 14 34 Q 24 32 34 34 T 50 34" opacity="0.5" />
    <path d="M 16 40 Q 28 38 40 40 T 52 40" opacity="0.5" />

    {/* Location pin marker */}
    <circle cx="32" cy="28" r="6" fill="currentColor" opacity="0.15" />
    <path d="M 32 18 L 32 28" strokeWidth="2" />
    <circle cx="32" cy="18" r="3" fill="currentColor" />

    {/* Compass rose detail (small, top right) */}
    <g transform="translate(50, 18)">
      <circle r="3" opacity="0.3" />
      <line x1="0" y1="-2.5" x2="0" y2="2.5" strokeWidth="1" />
      <line x1="-2.5" y1="0" x2="2.5" y2="0" strokeWidth="1" />
      <polygon points="0,-2.5 -0.5,-1.5 0.5,-1.5" fill="currentColor" />
    </g>
  </svg>
));

MapIcon.displayName = "MapIcon";
