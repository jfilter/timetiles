/**
 * Dynamic page route for Payload CMS pages.
 *
 * Fetches page content from Payload CMS by slug and renders using the
 * BlockRenderer system for flexible, StreamField-like content.
 *
 * @module
 */
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { BlockRenderer } from "@/components/block-renderer";
import { PageLayout } from "@/components/layout/page-layout";
import config from "@/payload.config";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function Page({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  const payload = await getPayload({
    config,
  });

  const pages = await payload.find({
    collection: "pages",
    where: {
      slug: {
        equals: slug,
      },
    },
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
