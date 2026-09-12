/**
 * Localized pipeline stage labels in import history.
 * @module
 * @category Tests
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IngestJobsDetail } from "@/app/[locale]/(frontend)/account/imports/_components/ingest-jobs-detail";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ jobs: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/hooks/use-ingest-jobs-query", () => ({
  useIngestJobsByFileQuery: () => ({ data: mocks.jobs(), isLoading: false, error: mocks.error() }),
}));

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("IngestJobsDetail ($locale)", ({ locale, messages }) => {
  it.each([false, true])("shows a fetch error with cached jobs: %s", (cached) => {
    mocks.error.mockReturnValue(new Error("Jobs unavailable"));
    mocks.jobs.mockReturnValue(
      cached ? [{ id: 1, dataset: 1, stage: "completed", createdAt: "2024-05-15T12:00:00Z" }] : undefined
    );
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <IngestJobsDetail ingestFileId={1} />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Jobs unavailable");
    expect(screen.queryByText(messages.ImportActivity.noJobs)).not.toBeInTheDocument();
    if (cached) expect(screen.getByText(messages.Ingest.stageComplete)).toBeVisible();
  });

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
