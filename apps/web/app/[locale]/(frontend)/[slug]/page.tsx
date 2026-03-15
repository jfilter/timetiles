/**
 * Dynamic page route for Payload CMS pages.
 *
 * Fetches page content from Payload CMS by slug, scoped to the current site,
 * and renders using the BlockRenderer system for flexible, StreamField-like content.
 *
 * @module
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { BlockRenderer } from "@/components/block-renderer";
import { PageLayout } from "@/components/layout/page-layout";
import { resolveSite } from "@/lib/services/site-resolver";
import config from "@/payload.config";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  const payload = await getPayload({ config });

  // Resolve site from request host
  const headersList = await headers();
  const host = headersList.get("host");
  const site = await resolveSite(payload, host);

  const pages = await payload.find({
    collection: "pages",
    where: { slug: { equals: slug }, ...(site != null && { site: { equals: site.id } }) },
    depth: 2,
  });

  if (!pages.docs.length) {
    notFound();
  }

  const page = pages.docs[0]!;

  return (
    <PageLayout title={page.title}>
      <BlockRenderer blocks={page.pageBuilder} />
    </PageLayout>
  );
}
