/**
 * Account deletion modal lifecycle with real React Query state.
 * @module
 * @category Tests
 */
import "@/tests/mocks/external/next-navigation";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccountModal } from "@/app/[locale]/(frontend)/account/settings/_components/delete-account-modal";
import type * as HttpError from "@/lib/api/http-error";
import { accountKeys } from "@/lib/hooks/use-account-mutations";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { mockNextNavigation } from "@/tests/mocks/external/next-navigation";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn(), postJson: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api/http-error", async (importOriginal) => ({
  ...(await importOriginal<typeof HttpError>()),
  fetchJson: mocks.fetchJson,
  postJson: mocks.postJson,
}));

const summary = {
  catalogs: { public: 0, private: 0 },
  datasets: { public: 0, private: 0 },
  events: { inPublicDatasets: 0, inPrivateDatasets: 0 },
  scheduledIngests: 0,
};
const response = { message: "Scheduled", deletionScheduledAt: "2030-07-12T12:00:00Z", summary };
const rejectionMessage = "Scheduling rejected";

describe("DeleteAccountModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNextNavigation.useRouter.mockReturnValue({ refresh: mocks.refresh });
    mocks.fetchJson.mockResolvedValue({ summary, canDelete: true, gracePeriodDays: 5 });
  });
  afterEach(cleanup);

  const renderModal = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onOpenChange = vi.fn();
    const modal = (open: boolean) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <DeleteAccountModal open={open} onOpenChange={onOpenChange} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const view = render(modal(true));
    return { ...view, client, setOpen: (open: boolean) => view.rerender(modal(open)), onOpenChange };
  };

  const confirmDeletion = async () => {
    const button = screen.getByRole("button", { name: en.Common.continue });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText(en.Common.password), { target: { value: TEST_CREDENTIALS.basic.password } });
    fireEvent.click(screen.getByRole("button", { name: en.Account.deleteMyAccount }));
    await waitFor(() => expect(mocks.postJson).toHaveBeenCalledOnce());
  };

  it("shows the server-provided date after scheduling succeeds", async () => {
    mocks.postJson.mockResolvedValue(response);
    const view = renderModal();
    await confirmDeletion();
    expect(
      await screen.findByText(new Date(response.deletionScheduledAt).toLocaleDateString("en"))
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole("button", { name: en.Common.close })[0]!);
    expect(view.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows mutation errors on the confirmation step", async () => {
    mocks.postJson.mockRejectedValue(new Error(rejectionMessage));
    renderModal();
    await confirmDeletion();
    expect(await screen.findByText(rejectionMessage)).toBeInTheDocument();
  });

  it("blocks confirmation when refreshing a cached summary fails", async () => {
    const view = renderModal();
    const proceed = screen.getByRole("button", { name: en.Common.continue });
    await waitFor(() => expect(proceed).toBeEnabled());
    mocks.fetchJson.mockRejectedValue(new Error("Summary unavailable"));

    await act(() => view.client.invalidateQueries({ queryKey: accountKeys.deletionSummary() }));

    expect(await screen.findByText("Summary unavailable")).toBeInTheDocument();
    expect(screen.getByText(en.Account.dataSummary)).toBeInTheDocument();
    expect(proceed).toBeDisabled();
    fireEvent.click(proceed);
    expect(screen.queryByLabelText(en.Common.password)).not.toBeInTheDocument();
    expect(mocks.postJson).not.toHaveBeenCalled();
  });

  it.each(["success", "error"])("discards late %s state after the modal closes", async (outcome) => {
    let complete!: () => void;
    const request = new Promise<typeof response>((resolve, reject) => {
      complete = () => (outcome === "success" ? resolve(response) : reject(new Error(rejectionMessage)));
    });
    mocks.postJson.mockReturnValue(request);
    const view = renderModal();
    await confirmDeletion();
    view.setOpen(false);
    await act(async () => {
      complete();
      await request.catch(() => undefined);
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
    expect(view.client.getQueryState(accountKeys.deletionSummary())?.isInvalidated).toBe(outcome === "success");
    view.setOpen(true);
    expect(await screen.findByText(en.Account.dataSummary)).toBeInTheDocument();
    expect(screen.queryByText(en.Account.deletionScheduled)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.Common.continue }));
    expect(screen.queryByText(rejectionMessage)).not.toBeInTheDocument();
  });
});
