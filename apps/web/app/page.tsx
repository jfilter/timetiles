/**
 * This file defines the home page of the application.
 *
 * It fetches the content for the page with the slug "home" from the Payload CMS.
 * If the page is found, it renders the title and its rich text content using the
 * `PageLayout` and `RichText` components. If the home page is not found in the CMS,
 * it will trigger a 404 error.
 * @module
 */
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { PageLayout } from "@/components/page-layout";
import { RichText } from "@/components/rich-text";
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

  return (
    <PageLayout title={page.title}>
      <RichText content={page.content} />
    </PageLayout>
  );
}
