/**
 * Homepage for TimeTiles - rendered from Payload CMS.
 *
 * Fetches page content from Payload with slug "home" and renders
 * using the BlockRenderer system, framed by the page's or site's layout template.
 *
 * @module
 */
import { cn } from "@timetiles/ui/lib/utils";
import { draftMode, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { getPayload } from "payload";
import React from "react";

import { PageChrome } from "@/app/_components/page-chrome";
import { BlockRenderer } from "@/components/block-renderer";
import { contentMaxWidthClass } from "@/components/layout/layout-frame";
import type { Locale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { resolveLayoutTemplate } from "@/lib/services/resolution/layout-resolver";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import config from "@/payload.config";

export default async function Page() {
  const [payload, locale] = await Promise.all([getPayload({ config }), getLocale() as Promise<Locale>]);
  const { isEnabled: isDraftMode } = await draftMode();

  // Scope to the requesting site (multi-site deployments each have their own
  // "home" page) and hide drafts outside Draft Mode — mirrors [slug]/page.tsx.
  const headersList = await headers();
  const site = await resolveSite(payload, headersList.get("host"));

  const pages = await payload.find({
    collection: "pages",
    where: {
      slug: { equals: "home" },
      ...(site != null && { site: { equals: site.id } }),
      ...(isDraftMode ? {} : { _status: { equals: "published" } }),
    },
    draft: isDraftMode,
    locale,
  });

  if (!pages.docs.length) {
    return redirect({ href: "/explore", locale });
  }

  const page = pages.docs[0]!;
  // The live site renders templates as anonymous visitors see them; previews use the editor's access.
  const user = isDraftMode ? (await payload.auth({ headers: headersList })).user : null;
  const layout = await resolveLayoutTemplate(payload, {
    pageOverride: page.layoutOverride,
    siteDefault: site?.defaultLayout,
    user,
    draft: isDraftMode,
  });
  const widthClass = layout == null ? "" : contentMaxWidthClass(layout.contentMaxWidth);

  return (
    <PageChrome layout={layout}>
      {widthClass === "" ? (
        <BlockRenderer blocks={page.pageBuilder} />
      ) : (
        <div className={cn("mx-auto w-full", widthClass)}>
          <BlockRenderer blocks={page.pageBuilder} />
        </div>
      )}
    </PageChrome>
  );
}
