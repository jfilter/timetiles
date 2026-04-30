/**
 * Homepage for TimeTiles - rendered from Payload CMS.
 *
 * Fetches page content from Payload with slug "/" and renders
 * using the BlockRenderer system for maximum flexibility.
 *
 * @module
 */
import { getLocale } from "next-intl/server";
import { getPayload } from "payload";
import React from "react";

import { BlockRenderer } from "@/components/block-renderer";
import type { Locale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import config from "@/payload.config";

export default async function Page() {
  const [payload, locale] = await Promise.all([getPayload({ config }), getLocale() as Promise<Locale>]);

  const pages = await payload.find({ collection: "pages", where: { slug: { equals: "home" } }, locale });

  if (!pages.docs.length) {
    return redirect({ href: "/explore", locale });
  }

  const page = pages.docs[0]!;

  return <BlockRenderer blocks={page.pageBuilder} />;
}
