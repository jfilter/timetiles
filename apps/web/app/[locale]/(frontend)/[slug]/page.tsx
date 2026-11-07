/**
 * Dynamic page route for Payload CMS pages.
 *
 * Fetches page content from Payload CMS by slug, scoped to the current site,
 * and renders using the BlockRenderer system for flexible, StreamField-like content,
 * framed by the page's or site's layout template.
 *
 * @module
 */
import { cn } from "@timetiles/ui/lib/utils";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPayload } from "payload";
import React from "react";

import { PageChrome } from "@/app/_components/page-chrome";
import { BlockRenderer } from "@/components/block-renderer";
import { contentMaxWidthClass } from "@/components/layout/layout-frame";
import { PageLayout } from "@/components/layout/page-layout";
import type { Locale } from "@/i18n/config";
import { resolveLayoutTemplate } from "@/lib/services/resolution/layout-resolver";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import config from "@/payload.config";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  const [payload, locale] = await Promise.all([getPayload({ config }), getLocale() as Promise<Locale>]);
  const { isEnabled: isDraftMode } = await draftMode();

  // Resolve site from request host
  const headersList = await headers();
  const host = headersList.get("host");
  const site = await resolveSite(payload, host);

  // Drafts are only served in Next Draft Mode (entered via /api/preview, which
  // requires auth) — without the _status filter, autosaved drafts of public
  // pages would render for anonymous visitors.
  const pages = await payload.find({
    collection: "pages",
    where: {
      slug: { equals: slug },
      ...(site != null && { site: { equals: site.id } }),
      ...(isDraftMode ? {} : { _status: { equals: "published" } }),
    },
    draft: isDraftMode,
    depth: 2,
    locale,
  });

  if (!pages.docs.length) {
    notFound();
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

  return (
    <PageChrome layout={layout}>
      {layout == null ? (
        <PageLayout title={page.title}>
          <BlockRenderer blocks={page.pageBuilder} />
        </PageLayout>
      ) : (
        <PageLayout
          title={page.title}
          maxWidth="full"
          containerClassName={cn("mx-auto w-full px-6", contentMaxWidthClass(layout.contentMaxWidth))}
        >
          <BlockRenderer blocks={page.pageBuilder} />
        </PageLayout>
      )}
    </PageChrome>
  );
}
