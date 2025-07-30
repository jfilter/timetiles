/**
 * @module This file defines the page for displaying a single, dynamically-routed page.
 *
 * It fetches the content for a page from the Payload CMS based on the slug provided in the
 * URL. If the page is found, it renders the title and content using the `PageLayout` and
 * `RichText` components. If no page is found for the given slug, it displays a 404 error.
 */
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { PageLayout } from "@/components/page-layout";
import { RichText } from "@/components/rich-text";
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
      <RichText content={page.content} />
    </PageLayout>
  );
}
