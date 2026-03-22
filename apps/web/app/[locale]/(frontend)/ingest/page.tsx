/**
 * Import page with multi-step wizard.
 *
 * This page provides a guided import wizard for uploading event data files.
 * The wizard layout (progress, navigation) is handled by layout.tsx.
 * Supports editing an existing scheduled ingest via `?edit=<id>` query parameter.
 *
 * @module
 */
import { IngestWizard } from "./_components";

// Force dynamic rendering to read cookies on every request
export const dynamic = "force-dynamic";

interface ImportPageProps {
  searchParams: Promise<{ edit?: string }>;
}

export default async function ImportPage({ searchParams }: Readonly<ImportPageProps>) {
  const params = await searchParams;
  const parsed = params.edit ? Number(params.edit) : NaN;
  const editScheduleId = Number.isNaN(parsed) ? null : parsed;

  return <IngestWizard editScheduleId={editScheduleId} />;
}
