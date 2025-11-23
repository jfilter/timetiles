/**
 * Timeline Icon - Temporal Analysis feature
 *
 * Cartographic-style icon featuring a timeline with histogram bars
 * showing temporal data distribution.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const TimelineIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 64, className, ...props }, ref) => (
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
    {/* Time axis with tick marks */}
    <line x1="8" y1="48" x2="56" y2="48" strokeWidth="2" />

    {/* Tick marks */}
    <line x1="12" y1="48" x2="12" y2="52" opacity="0.5" />
    <line x1="20" y1="48" x2="20" y2="52" opacity="0.5" />
    <line x1="28" y1="48" x2="28" y2="52" opacity="0.5" />
    <line x1="36" y1="48" x2="36" y2="52" opacity="0.5" />
    <line x1="44" y1="48" x2="44" y2="52" opacity="0.5" />
    <line x1="52" y1="48" x2="52" y2="52" opacity="0.5" />

    {/* Histogram bars (temporal data) */}
    <rect x="10" y="38" width="6" height="10" fill="currentColor" opacity="0.2" />
    <rect x="18" y="28" width="6" height="20" fill="currentColor" opacity="0.3" />
    <rect x="26" y="20" width="6" height="28" fill="currentColor" opacity="0.4" />
    <rect x="34" y="24" width="6" height="24" fill="currentColor" opacity="0.35" />
    <rect x="42" y="32" width="6" height="16" fill="currentColor" opacity="0.25" />
    <rect x="50" y="40" width="6" height="8" fill="currentColor" opacity="0.15" />

    {/* Trend line connecting data points */}
    <path d="M 13 43 L 21 33 L 29 25 L 37 29 L 45 37 L 53 44" fill="none" strokeWidth="2" opacity="0.6" />

    {/* Data points on timeline */}
    <circle cx="13" cy="43" r="2" fill="currentColor" />
    <circle cx="21" cy="33" r="2" fill="currentColor" />
    <circle cx="29" cy="25" r="2" fill="currentColor" />
    <circle cx="37" cy="29" r="2" fill="currentColor" />
    <circle cx="45" cy="37" r="2" fill="currentColor" />
    <circle cx="53" cy="44" r="2" fill="currentColor" />

    {/* Time indicator/cursor */}
    <g transform="translate(29, 12)">
      <circle r="4" opacity="0.15" fill="currentColor" />
      <line x1="0" y1="4" x2="0" y2="13" strokeWidth="2" opacity="0.4" strokeDasharray="2,2" />
    </g>
  </svg>
));

TimelineIcon.displayName = "TimelineIcon";
