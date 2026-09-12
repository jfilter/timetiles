/**
 * Verification state must follow the token in the URL.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import VerifyEmailPage from "@/app/[locale]/(frontend)/verify-email/page";
import { TEST_TOKENS } from "@/tests/constants/test-credentials";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ token: "", router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ token: mocks.token }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => mocks.router,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/layout/page-layout", () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => children,
}));

const renderPage = () => {
  const client = new QueryClient();
  const page = () => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <VerifyEmailPage />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(page());
  return () => view.rerender(page());
};

describe("email verification token changes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("verifies a new token after an earlier token failed", async () => {
    mocks.token = TEST_TOKENS.invalid;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ errors: [{ message: "Expired token" }] }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ message: "Verified" }));
    vi.stubGlobal("fetch", fetch);
    const rerender = renderPage();
    expect(await screen.findByText("Expired token")).toBeInTheDocument();

    mocks.token = TEST_TOKENS.generic;
    rerender();

    expect(await screen.findByText(en.VerifyEmail.verified)).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(`/api/users/verify/${TEST_TOKENS.generic}`, expect.any(Object));
  });

  it("ignores an old response after switching tokens during verification", async () => {
    mocks.token = TEST_TOKENS.invalid;
    let resolveOldResponse!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOldResponse = resolve;
    });
    const fetch = vi
      .fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(Response.json({ errors: [{ message: "New token expired" }] }, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    const rerender = renderPage();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    mocks.token = TEST_TOKENS.generic;
    rerender();
    expect(await screen.findByText("New token expired")).toBeInTheDocument();

    await act(async () => {
      resolveOldResponse(Response.json({ message: "Verified" }));
      await oldResponse;
    });
    expect(screen.getByText("New token expired")).toBeInTheDocument();
    expect(screen.queryByText(en.VerifyEmail.verified)).not.toBeInTheDocument();
  });
});
