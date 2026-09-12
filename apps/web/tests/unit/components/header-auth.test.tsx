/**
 * Logout UI must only clear authentication after a successful response.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeaderAuth } from "@/app/_components/header-auth";
import { authKeys } from "@/lib/hooks/use-auth-queries";
import type { User } from "@/payload-types";
import { TEST_EMAILS } from "@/tests/constants/test-credentials";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), isError: false }));
vi.mock("@/lib/hooks/use-auth-mutations", () => ({
  useLogoutMutation: () => ({ mutate: mocks.mutate, isError: mocks.isError, isPending: false }),
}));
vi.mock("@/lib/context/site-context", () => ({ useSite: () => ({ isDefaultSite: true }) }));

describe("HeaderAuth logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isError = false;
  });
  afterEach(cleanup);

  const user = { id: 1, email: TEST_EMAILS.admin, firstName: "Admin" } as User;
  const renderHeader = (locale = "en", messages = en) => {
    const client = new QueryClient();
    client.setQueryData(authKeys.currentUser, { user });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <HeaderAuth user={user} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    return client;
  };

  it("navigates only on success, not whenever the mutation settles", async () => {
    const events = userEvent.setup();
    const client = renderHeader();
    await events.click(screen.getByRole("button", { name: /Admin/ }));
    await events.click(screen.getByRole("menuitem", { name: en.Common.signOut }));

    expect(mocks.mutate).toHaveBeenCalledWith(undefined, { onSuccess: expect.any(Function) });
    expect(client.getQueryData(authKeys.currentUser)).toEqual({ user });
  });

  it.each([
    { locale: "en", messages: en },
    { locale: "de", messages: de },
  ])("shows a localized failure without clearing auth ($locale)", ({ locale, messages }) => {
    mocks.isError = true;
    const client = renderHeader(locale, messages);

    expect(screen.getByRole("alert")).toHaveTextContent(messages.Header.logoutError);
    expect(client.getQueryData(authKeys.currentUser)).toEqual({ user });
  });
});
