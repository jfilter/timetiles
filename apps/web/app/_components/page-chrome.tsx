/**
 * Header, main landmark and footer around CMS pages and the 404 page.
 *
 * Wires the server-rendered header and footers into `LayoutFrame` for a
 * resolved layout template; `null` renders the platform default.
 *
 * @module
 * @category Components
 */
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LayoutFrame } from "@/components/layout/layout-frame";
import type { LayoutSettings } from "@/lib/services/resolution/layout-resolver";

import { ConditionalTopMenuBar } from "./conditional-top-menu-bar";
import { CompactSiteFooter, SiteFooter } from "./site-footer";

interface PageChromeProps {
  layout: LayoutSettings | null;
  children: ReactNode;
}

export const PageChrome = async ({ layout, children }: Readonly<PageChromeProps>) => {
  const t = await getTranslations("Common");

  return (
    <LayoutFrame
      layout={layout}
      header={<ConditionalTopMenuBar layout={layout} />}
      fullFooter={<SiteFooter />}
      compactFooter={<CompactSiteFooter />}
      skipLinkLabel={t("skipToContent")}
    >
      {children}
    </LayoutFrame>
  );
};
