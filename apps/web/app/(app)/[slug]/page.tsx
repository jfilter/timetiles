import React from "react";
import { getPayload } from "payload";
import config from "@/payload.config";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";

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
    <div className="min-h-screen pb-12 pt-24">
      <div className="container mx-auto max-w-4xl px-6">
        <div className="flex justify-center">
          <div className="w-full max-w-3xl">
            <h1 className="mb-8 text-center text-4xl font-bold">
              {page.title}
            </h1>
            <div className="text-left">
              <RichText content={page.content} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
