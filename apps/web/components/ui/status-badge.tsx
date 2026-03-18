/**
 * Reusable status badge component for consistent status indicators.
 *
 * @module
 * @category Components
 */
import { type ReactNode } from "react";

export type StatusVariant = "success" | "error" | "warning" | "muted" | "info";

const variantStyles: Record<StatusVariant, string> = {
  success: "bg-cartographic-forest/10 text-cartographic-forest",
  error: "bg-destructive/10 text-destructive",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  muted: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
  icon?: ReactNode;
}

export const StatusBadge = ({ variant, label, icon }: StatusBadgeProps) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
  >
    {icon}
    {label}
  </span>
);
