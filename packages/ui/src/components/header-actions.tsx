/**
 * HeaderActions component for action buttons and tools.
 *
 * Composable subcomponent for the right side of the Header.
 * Contains theme toggle, user menu, CTA buttons, and other actions.
 *
 * @module
 * @category Components
 */

import * as React from "react";

import { cn } from "../lib/utils";

export interface HeaderActionsProps extends React.ComponentProps<"div"> {
  /**
   * Action items (buttons, theme toggle, user menu, etc.)
   */
  children: React.ReactNode;
}

/**
 * Action buttons container (right side of header).
 *
 * @example
 * ```tsx
 * <HeaderActions>
 *   <ThemeToggle />
 *   <UserMenu />
 *   <Button>Get Started</Button>
 * </HeaderActions>
 * ```
 */
const HeaderActions = ({ className, children, ref, ...props }: HeaderActionsProps) => {
  return (
    <div ref={ref} className={cn("flex items-center gap-4", "font-sans text-xs", className)} {...props}>
      {children}
    </div>
  );
};

HeaderActions.displayName = "HeaderActions";

export { HeaderActions };
