/**
 * Layout for app routes (explore, ingest, account, auth pages).
 *
 * Renders the route-based header, the main landmark with its skip link, and the
 * full footer. Layout templates do not apply here: they frame CMS pages only.
 *
 * @module
 */
import { getTranslations } from "next-intl/server";

import { ConditionalTopMenuBar } from "@/app/_components/conditional-top-menu-bar";
import { SiteFooter } from "@/app/_components/site-footer";
import { LayoutFrame } from "@/components/layout/layout-frame";

export default async function AppRoutesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("Common");

  return (
    <LayoutFrame
      layout={null}
      header={<ConditionalTopMenuBar />}
      fullFooter={<SiteFooter />}
      compactFooter={null}
      skipLinkLabel={t("skipToContent")}
    >
      {children}
    </LayoutFrame>
  );
}
