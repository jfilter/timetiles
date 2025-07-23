import { notFound } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { PageLayout } from "@/components/PageLayout";
import { RichText } from "@/components/RichText";
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
