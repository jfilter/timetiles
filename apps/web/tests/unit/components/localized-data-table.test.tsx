// @vitest-environment jsdom
/**
 * Tests for the locale-aware DataTable wrapper.
 *
 * @module
 * @category Unit Tests
 */
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import type { ColumnDef } from "@timetiles/ui/components/data-table";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { LocalizedDataTable } from "@/components/ui/localized-data-table";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

interface Row {
  id: number;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [{ accessorKey: "name", header: "Name" }];
const rows: Row[] = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

describe.each([
  { locale: "en", messages: en, page: "Page 1 of 2", previous: "Previous", next: "Next" },
  { locale: "de", messages: de, page: "Seite 1 von 2", previous: "Zurück", next: "Weiter" },
])("LocalizedDataTable ($locale)", ({ locale, messages, page, previous, next }) => {
  it("renders pagination texts in the active locale", () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocalizedDataTable columns={columns} data={rows} pageSize={10} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText(page)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: previous })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: next })).toBeInTheDocument();
  });

  it("renders the empty state in the active locale", () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocalizedDataTable columns={columns} data={[]} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText(messages.Common.noResults)).toBeInTheDocument();
  });
});
