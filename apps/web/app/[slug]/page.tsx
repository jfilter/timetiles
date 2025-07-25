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
