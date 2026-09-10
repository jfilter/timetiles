/**
 * Data package activation form and request contract.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataPackagesList } from "@/app/[locale]/(frontend)/account/data-packages/_components/data-packages-list";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/api/http-error", () => ({ fetchJson: mocks.fetchJson }));

describe("data package activation form", () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.fetchJson.mockImplementation((url: string) => {
      if (url === "/api/data-packages") {
        return Promise.resolve({
          packages: [
            {
              slug: "regional-events",
              title: "Regional events",
              summary: "Events",
              tags: [],
              activated: false,
              parameters: [{ name: "city", label: "City", required: true, example: "Berlin" }],
            },
          ],
        });
      }
      return Promise.resolve({ catalogId: 1, datasetId: 1, scheduledIngestId: 1 });
    });
  });
  afterEach(cleanup);

  const openForm = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <DataPackagesList />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    return screen.getByRole("dialog");
  };

  it("requires declared values and sends them through the activation hook", async () => {
    const dialog = await openForm();
    const input = within(dialog).getByLabelText("City");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("placeholder", "Berlin");
    expect(input).toBeInvalid();
    fireEvent.change(input, { target: { value: "Berlin" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Activate" }));
    await waitFor(() =>
      expect(mocks.fetchJson).toHaveBeenCalledWith(
        "/api/data-packages/regional-events/activate",
        expect.objectContaining({ body: JSON.stringify({ triggerFirstImport: true, parameters: { city: "Berlin" } }) })
      )
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps entered values visible when activation fails", async () => {
    const dialog = await openForm();
    mocks.fetchJson.mockRejectedValueOnce(new Error("Activation rejected"));
    fireEvent.change(within(dialog).getByLabelText("City"), { target: { value: "Berlin" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Activate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Activation rejected");
    expect(screen.getByLabelText("City")).toHaveValue("Berlin");
  });
});
