/**
 * Email Icon - Contact page
 *
 * Cartographic-style icon representing email/correspondence
 * with envelope and communication elements.
 *
 * @module
 * @category Icons
 */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const EmailIcon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 24, className, ...props }, ref) => (
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
    {/* Envelope */}
    <rect x="3" y="5" width="18" height="14" rx="2" />

    {/* Envelope flap */}
    <path d="M 3 7 L 12 13 L 21 7" />

    {/* Decorative grid lines (subtle) */}
    <line x1="8" y1="5" x2="8" y2="7" opacity="0.3" strokeWidth="1" />
    <line x1="16" y1="5" x2="16" y2="7" opacity="0.3" strokeWidth="1" />
  </svg>
));

EmailIcon.displayName = "EmailIcon";
