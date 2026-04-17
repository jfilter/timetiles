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
import { getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { EventDetailContent } from "@/components/events";
import { extractEventFields } from "@/lib/utils/event-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { id } = await params;
  const payload = await getPayload({ config: configPromise });

  const result = await payload.find({
    collection: "events",
    where: { id: { equals: id } },
    overrideAccess: false,
    depth: 1,
    limit: 1,
  });

  const event = result.docs[0];
  if (!event) {
    return { title: "Event | TimeTiles", description: "View event details on TimeTiles" };
  }

  const fieldMappings =
    typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;
  const { title, description } = extractEventFields(event.transformedData, fieldMappings, event.id);

  return { title: `${title} | TimeTiles`, description: description ?? "View event details on TimeTiles" };
};

interface EventDetailsPageProps {
  params: Promise<{ id: string }>;
}

// Draft mode banner component
const DraftModeBanner = ({ previewMode, draftPreview }: { previewMode: string; draftPreview: string }) => (
  <div className="border-ring bg-ring/10 mb-6 rounded-sm border px-4 py-3">
    <p className="text-ring font-serif font-bold">{previewMode}</p>
    <p className="text-muted-foreground text-sm">{draftPreview}</p>
  </div>
);

// Validation errors display component
const ValidationErrorsSection = ({ errors, title }: { errors: unknown[]; title: string }) => (
  <Card variant="ghost" padding="sm">
    <CardContent className="p-4">
      <h4 className="text-destructive mb-3 text-xs font-bold tracking-wider uppercase">{title}</h4>
      <div className="bg-destructive/10 rounded-sm p-3">
        <pre className="text-destructive text-sm whitespace-pre-wrap">{JSON.stringify(errors, null, 2)}</pre>
      </div>
    </CardContent>
  </Card>
);

// Schema version display component
const SchemaVersionSection = ({ label }: { label: string }) => (
  <div className="text-muted-foreground mt-6 border-t pt-4 text-sm">
    <span className="font-mono">{label}</span>
  </div>
);

export default async function EventDetailsPage({ params }: Readonly<EventDetailsPageProps>) {
  const { id } = await params;
  const { isEnabled: isDraftMode } = await draftMode();

  const payload = await getPayload({ config: configPromise });
  const t = await getTranslations("Events");

  // Fetch the event with draft mode support
  const result = await payload.find({
    collection: "events",
    where: { id: { equals: id } },
    depth: 2, // Include related data like dataset
    draft: isDraftMode,
    overrideAccess: false, // Never bypass access control on public pages
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
      {isDraftMode && <DraftModeBanner previewMode={t("previewMode")} draftPreview={t("draftPreview")} />}

      {/* Main Event Content - using shared component */}
      <EventDetailContent event={event} variant="page" />

      {/* Additional page-only sections */}
      <div className={cn("mt-8 space-y-6", hasValidationErrors && "border-t pt-6")}>
        {/* Validation Errors */}
        {hasValidationErrors && (
          <ValidationErrorsSection errors={event.validationErrors as unknown[]} title={t("validationErrors")} />
        )}

        {/* Schema Version Info */}
        {event.schemaVersionNumber != null && (
          <SchemaVersionSection label={t("schemaVersion", { version: event.schemaVersionNumber })} />
        )}
      </div>
    </div>
  );
}
