/**
 * Homepage for TimeTiles - rendered from Payload CMS.
 *
 * Fetches page content from Payload with slug "/" and renders
 * using the BlockRenderer system for maximum flexibility.
 *
 * @module
 */
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { BlockRenderer } from "@/components/block-renderer";
import config from "@/payload.config";

export default async function Page() {
  const payload = await getPayload({
    config,
  });

  const pages = await payload.find({
    collection: "pages",
    where: {
      slug: {
        equals: "home",
      },
    },
  });

  if (!pages.docs.length) {
    notFound();
  }

  const page = pages.docs[0]!;

  return <BlockRenderer blocks={page.pageBuilder} />;
}
