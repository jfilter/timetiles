/**
 * Account table mutation failures remain visible after the menu closes.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduledIngestsTable } from "@/app/[locale]/(frontend)/account/imports/_components/scheduled-ingests-table";
import { ScrapersTable } from "@/app/[locale]/(frontend)/account/imports/_components/scrapers-table";
import type { ScheduledIngest, Scraper, ScraperRepo } from "@/payload-types";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/api/http-error", () => mocks);
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/use-scheduled-ingests-query", () => ({
  useScheduledIngestsQuery: (data: unknown) => ({ data, isLoading: false }),
}));
vi.mock("@/lib/hooks/use-scrapers-query", () => ({
  useScraperReposQuery: (data: unknown) => ({ data }),
  useScrapersQuery: (_repoId: unknown, data: unknown) => ({ data }),
  useScraperRunsQuery: () => ({ data: [], isLoading: false }),
}));

describe("Account table actions", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it.each([
    { table: "schedule", action: "enable", confirm: false },
    { table: "schedule", action: "runNow", confirm: false },
    { table: "schedule", action: "delete", confirm: true },
    { table: "scraper", action: "runScraper", confirm: false },
    { table: "scraper", action: "syncRepo", confirm: false },
    { table: "scraper", action: "deleteRepo", confirm: true },
  ] as const)("shows errors and permits retry: $table/$action", async ({ table, action, confirm }) => {
    const events = userEvent.setup();
    let rejectRequest!: (error: Error) => void;
    mocks.fetchJson
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectRequest = reject;
          })
      )
      .mockResolvedValue({ doc: {} });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en}>
          {table === "schedule" ? (
            <ScheduledIngestsTable
              initialData={[{ id: 1, name: "Schedule", enabled: false, frequency: "daily" } as ScheduledIngest]}
            />
          ) : (
            <ScrapersTable
              initialRepos={[{ id: 2, name: "Repository" } as ScraperRepo]}
              initialScrapers={[{ id: 3, repo: 2, name: "Scraper" } as Scraper]}
            />
          )}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );

    const performAction = async () => {
      await events.click(screen.getByRole("button", { name: en.ImportActivity.actions }));
      await events.click(screen.getByRole("menuitem", { name: en.ImportActivity[action] }));
      if (confirm) {
        await events.click(within(screen.getByRole("dialog")).getByRole("button", { name: en.ImportActivity[action] }));
      }
    };
    await performAction();
    await waitFor(() => expect(screen.getByRole("button", { name: en.ImportActivity.actions })).toBeDisabled());
    act(() => rejectRequest(new Error("Request failed. Please retry.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed. Please retry.");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.ImportActivity.actions })).toBeEnabled();

    await performAction();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mocks.fetchJson).toHaveBeenCalledTimes(action === "runNow" ? 3 : 2);
    client.clear();
  });
});
