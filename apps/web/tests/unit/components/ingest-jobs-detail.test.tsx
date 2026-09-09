/**
 * Localized pipeline stage labels in import history.
 * @module
 * @category Tests
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IngestJobsDetail } from "@/app/[locale]/(frontend)/account/imports/_components/ingest-jobs-detail";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ jobs: vi.fn() }));
vi.mock("@/lib/hooks/use-ingest-jobs-query", () => ({
  useIngestJobsByFileQuery: () => ({ data: mocks.jobs(), isLoading: false }),
}));

afterEach(cleanup);

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("IngestJobsDetail ($locale)", ({ locale, messages }) => {
  it.each([
    ["analyze-duplicates", "stageAnalyzingDuplicates"],
    ["detect-schema", "stageDetectingSchema"],
    ["validate-schema", "stageValidating"],
    ["needs-review", "stageAwaitingApproval"],
    ["create-schema-version", "stageSettingUpDataset"],
    ["geocode-batch", "stageGeocoding"],
    ["create-events", "stageCreatingEvents"],
    ["completed", "stageComplete"],
    ["failed", "importFailed"],
  ] as const)("translates stage %s", (stage, key) => {
    mocks.jobs.mockReturnValue([{ id: 1, dataset: 1, stage, createdAt: "2024-05-15T12:00:00Z" }]);
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <IngestJobsDetail ingestFileId={1} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(messages.Ingest[key])).toBeInTheDocument();
  });
});
