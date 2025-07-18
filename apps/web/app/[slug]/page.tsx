import React from "react";
import { getPayload } from "payload";
import config from "@/payload.config";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import { PageLayout } from "@/components/PageLayout";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function Page({ params }: PageProps) {
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
