/**
 * Support Icon - Contact page
 *
 * Cartographic-style icon representing technical support
 * with tools and assistance elements.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const SupportIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 24, className, ...props }, ref) => (
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
    {/* Wrench head */}
    <circle cx="9" cy="7" r="3" />

    {/* Wrench handle */}
    <path d="M 10.5 8.5 L 17 15 L 19 13 L 12.5 6.5" />

    {/* Adjustment notches */}
    <line x1="14" y1="12" x2="15" y2="11" strokeWidth="2" />
    <line x1="16" y1="14" x2="17" y2="13" strokeWidth="2" />

    {/* Center detail (bolt) */}
    <circle cx="9" cy="7" r="1" fill="currentColor" />

    {/* Grid reference lines (subtle) */}
    <line x1="6" y1="4" x2="12" y2="4" opacity="0.2" strokeWidth="1" />
    <line x1="6" y1="10" x2="12" y2="10" opacity="0.2" strokeWidth="1" />
  </svg>
));

SupportIcon.displayName = "SupportIcon";
