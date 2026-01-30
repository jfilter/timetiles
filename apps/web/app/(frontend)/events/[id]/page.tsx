/**
 * Event detail page with draft mode support.
 *
 * Fetches and displays detailed event information. Supports Next.js Draft Mode
 * for previewing unpublished events. Uses the shared EventDetailContent component
 * for consistent rendering with the explore page modal.
 *
 * @module
 * @category Pages
 */
import configPromise from "@payload-config";
import { Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";

import { EventDetailContent } from "@/components/events";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { id } = await params;
  const payload = await getPayload({ config: configPromise });

  const result = await payload.find({
    collection: "events",
    where: { id: { equals: id } },
    depth: 1,
    limit: 1,
  });

  const event = result.docs[0];
  const eventData = event?.data as Record<string, unknown> | undefined;
  const title = (eventData?.title as string) || (eventData?.name as string) || `Event ${id}`;

  return {
    title: `${title} | TimeTiles`,
    description: (eventData?.description as string) || "View event details on TimeTiles",
  };
};

interface EventDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Draft mode banner component
const DraftModeBanner = () => (
  <div className="border-cartographic-gold bg-cartographic-gold/10 mb-6 rounded-sm border px-4 py-3">
    <p className="text-cartographic-gold font-serif font-bold">Preview Mode</p>
    <p className="text-muted-foreground text-sm">You are viewing a draft version of this event.</p>
  </div>
);

// Validation errors display component
const ValidationErrorsSection = ({ errors }: { errors: unknown[] }) => (
  <Card variant="ghost" padding="sm">
    <CardContent className="p-4">
      <h4 className="text-destructive mb-3 text-xs font-bold tracking-wider uppercase">Validation Errors</h4>
      <div className="bg-destructive/10 rounded-sm p-3">
        <pre className="text-destructive text-sm whitespace-pre-wrap">{JSON.stringify(errors, null, 2)}</pre>
      </div>
    </CardContent>
  </Card>
);

// Schema version display component
const SchemaVersionSection = ({ version }: { version: number }) => (
  <div className="text-muted-foreground mt-6 border-t pt-4 text-sm">
    <span className="font-mono">Schema Version: {version}</span>
  </div>
);

export default async function EventDetailsPage({ params }: Readonly<EventDetailsPageProps>) {
  const { id } = await params;
  const { isEnabled: isDraftMode } = await draftMode();

  const payload = await getPayload({ config: configPromise });

  // Fetch the event with draft mode support
  const result = await payload.find({
    collection: "events",
    where: {
      id: {
        equals: id,
      },
    },
    depth: 2, // Include related data like dataset
    draft: isDraftMode,
    overrideAccess: isDraftMode, // Allow access to drafts in preview mode
    limit: 1,
  });

  const event = result.docs[0];

  if (!event) {
    notFound();
  }

  const hasValidationErrors =
    event.validationErrors != null && Array.isArray(event.validationErrors) && event.validationErrors.length > 0;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Draft Mode Banner */}
      {isDraftMode && <DraftModeBanner />}

      {/* Main Event Content - using shared component */}
      <EventDetailContent event={event} variant="page" />

      {/* Additional page-only sections */}
      <div className={cn("mt-8 space-y-6", hasValidationErrors && "border-t pt-6")}>
        {/* Validation Errors */}
        {hasValidationErrors && <ValidationErrorsSection errors={event.validationErrors as unknown[]} />}

        {/* Schema Version Info */}
        {event.schemaVersionNumber != null && <SchemaVersionSection version={event.schemaVersionNumber} />}
      </div>
    </div>
  );
}
