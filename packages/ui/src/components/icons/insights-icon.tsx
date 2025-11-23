/**
 * Insights Icon - Powerful Insights feature
 *
 * Cartographic-style icon featuring clustered data points with
 * a magnifying lens for analysis and discovery.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const InsightsIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 64, className, ...props }, ref) => (
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
    {/* Data scatter plot background */}
    <rect x="8" y="12" width="40" height="40" rx="2" opacity="0.2" />

    {/* Grid for spatial reference */}
    <line x1="8" y1="27" x2="48" y2="27" opacity="0.15" />
    <line x1="8" y1="37" x2="48" y2="37" opacity="0.15" />
    <line x1="23" y1="12" x2="23" y2="52" opacity="0.15" />
    <line x1="33" y1="12" x2="33" y2="52" opacity="0.15" />

    {/* Cluster 1 - top left */}
    <circle cx="16" cy="20" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="19" cy="22" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="21" cy="19" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="18" cy="24" r="1.5" fill="currentColor" opacity="0.4" />

    {/* Cluster 2 - center */}
    <circle cx="28" cy="30" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="31" cy="32" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="26" cy="33" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="30" cy="28" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="27" cy="35" r="1.5" fill="currentColor" opacity="0.4" />

    {/* Cluster 3 - bottom right */}
    <circle cx="38" cy="42" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="41" cy="44" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="40" cy="40" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="43" cy="43" r="1.5" fill="currentColor" opacity="0.4" />

    {/* Outlier points */}
    <circle cx="14" cy="45" r="1.5" fill="currentColor" opacity="0.2" />
    <circle cx="42" cy="18" r="1.5" fill="currentColor" opacity="0.2" />

    {/* Magnifying glass */}
    <circle cx="38" cy="38" r="12" strokeWidth="2.5" />
    <circle cx="38" cy="38" r="12" fill="currentColor" opacity="0.05" />

    {/* Magnifying glass handle */}
    <line x1="46" y1="46" x2="54" y2="54" strokeWidth="2.5" />

    {/* Focus ring inside magnifier */}
    <circle cx="38" cy="38" r="8" opacity="0.3" strokeWidth="1" strokeDasharray="2,2" />

    {/* Highlighted cluster (visible through magnifier) */}
    <g opacity="0.8">
      <line x1="36" y1="36" x2="40" y2="40" strokeWidth="1" opacity="0.3" />
      <line x1="36" y1="40" x2="40" y2="36" strokeWidth="1" opacity="0.3" />
    </g>
  </svg>
));

InsightsIcon.displayName = "InsightsIcon";
