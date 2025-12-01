/**
 * Import page with multi-step wizard.
 *
 * This page provides a guided import wizard for uploading event data files.
 * The wizard layout (progress, navigation) is handled by layout.tsx.
 *
 * @module
 */
import { ImportWizard } from "./_components";

// Force dynamic rendering to read cookies on every request
export const dynamic = "force-dynamic";

export default function ImportPage() {
  return <ImportWizard />;
}
