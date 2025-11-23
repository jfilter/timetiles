/**
 * Location Icon - Contact page
 *
 * Cartographic-style icon representing physical location
 * with map pin and coordinate elements.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const LocationIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 24, className, ...props }, ref) => (
  <svg
    ref={ref}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Map pin outer shape */}
    <path d="M 12 2 C 8.7 2 6 4.7 6 8 C 6 12.5 12 20 12 20 S 18 12.5 18 8 C 18 4.7 15.3 2 12 2 Z" />

    {/* Inner circle (center point) */}
    <circle cx="12" cy="8" r="2.5" fill="currentColor" opacity="0.3" />

    {/* Coordinate crosshairs */}
    <line x1="12" y1="5.5" x2="12" y2="6.5" opacity="0.4" strokeWidth="1" />
    <line x1="12" y1="9.5" x2="12" y2="10.5" opacity="0.4" strokeWidth="1" />
    <line x1="9.5" y1="8" x2="10.5" y2="8" opacity="0.4" strokeWidth="1" />
    <line x1="13.5" y1="8" x2="14.5" y2="8" opacity="0.4" strokeWidth="1" />
  </svg>
));

LocationIcon.displayName = "LocationIcon";
