/**
 * Manual import status localization using the real table and translations.
 * @module
 * @category Tests
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManualImportsTable } from "@/app/[locale]/(frontend)/account/imports/_components/manual-imports-table";
import type { IngestFile } from "@/payload-types";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

vi.mock("@/lib/hooks/use-ingest-files-query", () => ({
  useIngestFilesQuery: (data: IngestFile[]) => ({ data, isLoading: false }),
}));

afterEach(cleanup);

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("ManualImportsTable ($locale)", ({ locale, messages }) => {
  const renderFile = (overrides: Partial<IngestFile>) => {
    const file: IngestFile = {
      id: 1,
      user: 1,
      createdAt: "2024-05-15T12:00:00Z",
      updatedAt: "2024-05-15T12:00:00Z",
      ...overrides,
    };
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ManualImportsTable initialData={[file]} />
      </NextIntlClientProvider>
    );
  };

  it.each([
    ["pending", "statusPending"],
    ["parsing", "statusParsing"],
    ["processing", "statusProcessing"],
    ["completed", "statusCompleted"],
    ["failed", "statusFailed"],
    [null, "statusPending"],
    [undefined, "statusPending"],
  ] as const)("translates status %s", (status, key) => {
    renderFile({ status });
    expect(screen.getByRole("cell", { name: messages.ImportActivity[key] })).toBeInTheDocument();
  });

  it("preserves the review label once all datasets have been processed", () => {
    renderFile({ status: "processing", datasetsCount: 1, datasetsProcessed: 1 });
    expect(screen.getByText(messages.Ingest.reviewRequired)).toBeInTheDocument();
  });
});
