/**
 * Homepage for TimeTiles - rendered from Payload CMS.
 *
 * Fetches page content from Payload with slug "/" and renders
 * using the BlockRenderer system for maximum flexibility.
 *
 * @module
 */
import { draftMode, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { getPayload } from "payload";
import React from "react";

import { BlockRenderer } from "@/components/block-renderer";
import type { Locale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
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

  return <BlockRenderer blocks={page.pageBuilder} />;
}
