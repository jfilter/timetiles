/**
 * Business Icon - Contact page
 *
 * Cartographic-style icon representing business/partnerships
 * with briefcase and professional elements.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const BusinessIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 24, className, ...props }, ref) => (
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
    {/* Briefcase body */}
    <rect x="4" y="8" width="16" height="11" rx="2" />

    {/* Briefcase handle */}
    <path d="M 8 8 V 6 C 8 4.9 8.9 4 10 4 H 14 C 15.1 4 16 4.9 16 6 V 8" />

    {/* Lock/clasp detail */}
    <rect x="11" y="12" width="2" height="3" fill="currentColor" opacity="0.3" />

    {/* Horizontal division line */}
    <line x1="4" y1="13" x2="20" y2="13" opacity="0.3" strokeWidth="1" />
  </svg>
));

BusinessIcon.displayName = "BusinessIcon";
