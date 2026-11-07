/**
 * Page frame for CMS pages and app routes: skip link, header, main landmark, footer.
 *
 * Applies a resolved layout template's header and footer variants. A `null`
 * layout is the platform default: the route-based header and the full footer.
 *
 * @module
 * @category Components
 */
import type { ReactNode } from "react";

import type { LayoutSettings } from "@/lib/services/resolution/layout-resolver";

/** Target of the skip link; the main landmark carries this ID. */
export const MAIN_CONTENT_ID = "main-content";

/** Maps a template's content width to its Tailwind max-width class. */
export const contentMaxWidthClass = (width: LayoutSettings["contentMaxWidth"]): string => {
  switch (width) {
    case "sm":
      return "max-w-3xl";
    case "md":
      return "max-w-5xl";
    case "lg":
      return "max-w-6xl";
    case "xl":
      return "max-w-7xl";
    case "full":
      return "";
  }
};

interface LayoutFrameProps {
  layout: LayoutSettings | null;
  /** Header configured for `layout`; omitted when the header variant is "none". */
  header: ReactNode;
  fullFooter: ReactNode;
  compactFooter: ReactNode;
  skipLinkLabel: string;
  children: ReactNode;
}

const selectFooter = (
  variant: LayoutSettings["footerVariant"],
  fullFooter: ReactNode,
  compactFooter: ReactNode
): ReactNode => {
  switch (variant) {
    case "full":
      return fullFooter;
    case "compact":
      return compactFooter;
    case "none":
      return null;
  }
};

export const LayoutFrame = ({
  layout,
  header,
  fullFooter,
  compactFooter,
  skipLinkLabel,
  children,
}: Readonly<LayoutFrameProps>) => (
  <>
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="bg-background text-foreground focus:ring-ring sr-only rounded-sm px-4 py-2 font-sans text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:ring-2"
    >
      {skipLinkLabel}
    </a>
    {layout?.headerVariant !== "none" && header}
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
      {children}
    </main>
    {selectFooter(layout?.footerVariant ?? "full", fullFooter, compactFooter)}
  </>
);
