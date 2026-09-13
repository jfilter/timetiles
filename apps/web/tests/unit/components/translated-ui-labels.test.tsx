// @vitest-environment jsdom
/**
 * Tests that shared UI components render in the active locale through UIProvider.
 *
 * @module
 * @category Unit Tests
 */
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { ConfirmDialog } from "@timetiles/ui/components/confirm-dialog";
import { type ColumnDef, DataTable } from "@timetiles/ui/components/data-table";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@timetiles/ui/components/dialog";
import { NewsletterForm } from "@timetiles/ui/components/newsletter-form";
import { UIProvider } from "@timetiles/ui/provider";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useTranslatedUILabels } from "@/components/use-translated-ui-labels";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

interface Row {
  id: number;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [{ accessorKey: "name", header: "Name" }];
const rows: Row[] = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

const TranslatedUI = ({ children }: { children: ReactNode }) => (
  <UIProvider labels={useTranslatedUILabels()}>{children}</UIProvider>
);

describe.each([
  { locale: "en", messages: en, page: "Page 1 of 2" },
  { locale: "de", messages: de, page: "Seite 1 von 2" },
])("translated UI labels ($locale)", ({ locale, messages, page }) => {
  const renderTranslated = (ui: ReactNode) =>
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <TranslatedUI>{ui}</TranslatedUI>
      </NextIntlClientProvider>
    );

  it("renders data table pagination without per-call labels", () => {
    renderTranslated(<DataTable columns={columns} data={rows} pageSize={10} />);

    expect(screen.getByText(page)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.Common.previous })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.Common.next })).toBeInTheDocument();
  });

  it("renders confirm dialog buttons without per-call labels", () => {
    renderTranslated(
      <ConfirmDialog open onOpenChange={vi.fn()} title="Title" description="Description" onConfirm={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: messages.Common.confirm })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.Common.cancel })).toBeInTheDocument();
  });

  it("names the dialog close button without per-call labels", () => {
    renderTranslated(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("button", { name: messages.Common.close })).toBeInTheDocument();
  });

  it("labels the newsletter email input without per-call labels", () => {
    renderTranslated(<NewsletterForm messages={messages.Newsletter} onSubmit={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: messages.Newsletter.emailAddress })).toBeInTheDocument();
  });
});
