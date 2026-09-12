/**
 * Account lists distinguish fetch failures from empty results and retain cached rows.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManualImportsTable } from "@/app/[locale]/(frontend)/account/imports/_components/manual-imports-table";
import { ScheduledIngestsTable } from "@/app/[locale]/(frontend)/account/imports/_components/scheduled-ingests-table";
import { ScrapersTable } from "@/app/[locale]/(frontend)/account/imports/_components/scrapers-table";
import type { IngestFile, ScheduledIngest, Scraper, ScraperRepo } from "@/payload-types";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ source: "", error: new Error("List unavailable") }));
vi.mock("@/lib/hooks/use-ingest-files-query", () => ({
  useIngestFilesQuery: (data: unknown) => ({ data, error: mocks.source === "manual" ? mocks.error : null }),
}));
vi.mock("@/lib/hooks/use-scheduled-ingests-query", () => ({
  useScheduledIngestsQuery: (data: unknown) => ({ data, error: mocks.source === "schedule" ? mocks.error : null }),
}));
vi.mock("@/lib/hooks/use-scrapers-query", () => ({
  useScraperReposQuery: (data: unknown) => ({ data, error: mocks.source === "repos" ? mocks.error : null }),
  useScrapersQuery: (_id: unknown, data: unknown) => ({
    data,
    error: mocks.source === "scrapers" ? mocks.error : null,
  }),
  useScraperRunsQuery: () => ({ data: [] }),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

describe.each(["manual", "schedule", "repos", "scrapers"])("Account list fetch failure: %s", (source) => {
  it.each([false, true])("shows an error with cached rows: %s", (cached) => {
    mocks.source = source;
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en}>
          {source === "manual" && (
            <ManualImportsTable initialData={cached ? [{ id: 1, filename: "Cached record" } as IngestFile] : []} />
          )}
          {source === "schedule" && (
            <ScheduledIngestsTable
              initialData={cached ? [{ id: 1, name: "Cached record", frequency: "daily" } as ScheduledIngest] : []}
            />
          )}
          {(source === "repos" || source === "scrapers") && (
            <ScrapersTable
              initialRepos={cached ? [{ id: 2, name: "Repository" } as ScraperRepo] : []}
              initialScrapers={cached ? [{ id: 1, name: "Cached record", repo: 2 } as Scraper] : []}
            />
          )}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("List unavailable");
    for (const message of [en.ImportActivity.noImports, en.ImportActivity.noSchedules, en.ImportActivity.noScrapers]) {
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    }
    if (cached) expect(screen.getByText("Cached record")).toBeVisible();
    client.clear();
  });
});
