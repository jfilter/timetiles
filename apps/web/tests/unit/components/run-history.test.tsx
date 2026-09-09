/**
 * Localized, visible statuses in both import execution histories.
 * @module
 * @category Tests
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScheduleRunHistory } from "@/app/[locale]/(frontend)/account/imports/_components/schedule-run-history";
import { ScraperRunHistory } from "@/app/[locale]/(frontend)/account/imports/_components/scraper-run-history";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ runs: vi.fn() }));
vi.mock("@/lib/hooks/use-scrapers-query", () => ({
  useScraperRunsQuery: () => ({ data: mocks.runs(), isLoading: false }),
}));

afterEach(cleanup);

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("run history ($locale)", ({ locale, messages }) => {
  it.each([
    ["success", "statusSuccess"],
    ["failed", "statusFailed"],
    ["timeout", "statusTimeout"],
    ["running", "statusRunning"],
    ["queued", "statusPending"],
  ] as const)("translates scraper status %s", (status, key) => {
    mocks.runs.mockReturnValue([{ id: 1, status, createdAt: "2024-05-15T12:00:00Z" }]);
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ScraperRunHistory scraperId={1} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(messages.ImportActivity[key])).toBeVisible();
    expect(screen.queryByLabelText(status)).not.toBeInTheDocument();
  });

  it.each([
    ["success", "statusSuccess"],
    ["failed", "statusFailed"],
    ["paused", "statusAwaitingReview"],
  ] as const)("shows a visible translated schedule status %s", (status, key) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ScheduleRunHistory scheduleId={1} executionHistory={[{ status, executedAt: "2024-05-15T12:00:00Z" }]} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(messages.ImportActivity[key])).toBeVisible();
    expect(screen.queryByLabelText(status)).not.toBeInTheDocument();
  });
});
