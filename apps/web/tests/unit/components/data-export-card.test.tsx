/**
 * Export-card localization with the real next-intl provider and formatters.
 *
 * @module
 * @category Tests
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataExportCard } from "@/app/[locale]/(frontend)/account/settings/_components/data-export-card";
import type { DataExport } from "@/lib/export/api-types";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ latestExport: vi.fn() }));
vi.mock("@/lib/hooks/use-data-export", () => ({
  useLatestExportQuery: () => ({ latestExport: mocks.latestExport(), isLoading: false }),
  useRequestDataExportMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

const now = new Date("2024-05-15T12:00:00Z");

describe.each([
  {
    locale: "de",
    messages: de,
    month: "05",
    unknown: "Unbekannt",
    expired: "Abgelaufen",
    expiry: "Läuft in 5 Stunden ab",
  },
  { locale: "en", messages: en, month: "May", unknown: "Unknown", expired: "Expired", expiry: "Expires in 5 hours" },
])("DataExportCard ($locale)", ({ locale, messages, month, unknown, expired, expiry }) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderExport = (overrides: Partial<DataExport> = {}) => {
    mocks.latestExport.mockReturnValue({
      id: 1,
      status: "ready",
      completedAt: now.toISOString(),
      requestedAt: now.toISOString(),
      expiresAt: "2024-05-15T17:00:00Z",
      fileSize: 1024,
      ...overrides,
    });
    return render(
      <NextIntlClientProvider locale={locale} messages={messages} now={now} timeZone="UTC">
        <DataExportCard />
      </NextIntlClientProvider>
    );
  };

  it("localizes the completion date and time remaining", () => {
    renderExport();
    expect(screen.getByRole("link", { name: messages.DataExport.downloadExport })).toHaveAttribute(
      "href",
      "/api/data-exports/1/download"
    );
    expect(screen.getByText(new RegExp(`15.*${month}|${month}.*15`))).toBeInTheDocument();
    expect(screen.getByText(expiry)).toBeInTheDocument();
  });

  it.each([1, 42, 999999])("links directly to export %s", (id) => {
    renderExport({ id });
    expect(screen.getByRole("link", { name: messages.DataExport.downloadExport })).toHaveAttribute(
      "href",
      `/api/data-exports/${id}/download`
    );
  });

  it("localizes the request date while pending", () => {
    renderExport({ status: "pending" });
    expect(screen.getByText(new RegExp(`15.*${month}|${month}.*15`))).toBeInTheDocument();
  });

  it.each([null, undefined, "", "not-a-date"])("uses a localized fallback for completion date %s", (completedAt) => {
    renderExport({ completedAt });
    expect(screen.getByText(new RegExp(unknown))).toBeInTheDocument();
  });

  it("uses a localized fallback for an invalid request date", () => {
    renderExport({ status: "pending", requestedAt: "not-a-date" });
    expect(screen.getByText(new RegExp(unknown))).toBeInTheDocument();
  });

  it.each([null, undefined, "", "not-a-date"])("omits an invalid expiry %s", (expiresAt) => {
    renderExport({ expiresAt });
    expect(screen.queryByText(expiry)).not.toBeInTheDocument();
    expect(screen.queryByText(expired)).not.toBeInTheDocument();
  });

  it.each(["2024-05-15T11:59:00Z", "2024-05-15T12:00:00Z"])("labels expired timestamps: %s", (expiresAt) => {
    renderExport({ expiresAt });
    expect(screen.getByText(expired)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: messages.DataExport.downloadExport })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.DataExport.requestDataExport })).toBeEnabled();
    expect(screen.queryByText(messages.DataExport.ready)).not.toBeInTheDocument();
  });

  it("honors an expired server status even with a future expiry timestamp", () => {
    renderExport({ status: "expired" });
    expect(screen.getByText(expired)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: messages.DataExport.downloadExport })).not.toBeInTheDocument();
  });

  it("updates the expiry display without another network response", () => {
    renderExport({ expiresAt: "2024-05-15T12:00:30Z" });
    expect(screen.getByRole("link", { name: messages.DataExport.downloadExport })).toHaveAttribute(
      "href",
      "/api/data-exports/1/download"
    );
    expect(screen.queryByText(expired)).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(expired)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: messages.DataExport.downloadExport })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.DataExport.requestDataExport })).toBeEnabled();
  });
});
