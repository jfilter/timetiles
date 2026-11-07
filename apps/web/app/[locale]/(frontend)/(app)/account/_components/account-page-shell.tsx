/**
 * Shared shell for account pages.
 *
 * Provides consistent container, heading, and description layout
 * across all /account/* pages.
 *
 * @module
 * @category Components
 */
import type { ReactNode } from "react";

interface AccountPageShellProps {
  readonly title: string;
  readonly description?: string;
  readonly maxWidth?: "2xl" | "3xl" | "4xl" | "5xl";
  readonly children: ReactNode;
}

const maxWidthClasses = { "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl" };

export const AccountPageShell = ({ title, description, maxWidth = "4xl", children }: AccountPageShellProps) => (
  <div className={`container mx-auto ${maxWidthClasses[maxWidth]} px-4 py-8`}>
    <div className="mb-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      {description && <p className="text-muted-foreground mt-1">{description}</p>}
    </div>
    {children}
  </div>
);
