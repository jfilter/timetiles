/**
 * Password reset success and redirects belong to the current URL token.
 *
 * @module
 * @category Tests
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";

import { ResetPasswordContent } from "@/app/[locale]/(frontend)/reset-password/_components/reset-password-content";
import { TEST_TOKENS } from "@/tests/constants/test-credentials";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ token: "", router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ token: mocks.token }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => mocks.router,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/auth", () => ({
  ResetPasswordForm: ({ token, onSuccess }: { token: string; onSuccess: () => void }) => (
    <button onClick={onSuccess}>{token}</button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("discards success and its pending redirect when the token changes", async () => {
  vi.useFakeTimers();
  mocks.token = TEST_TOKENS.invalid;
  const page = () => (
    <NextIntlClientProvider locale="en" messages={en}>
      <ResetPasswordContent />
    </NextIntlClientProvider>
  );
  const view = render(page());
  fireEvent.click(screen.getByRole("button", { name: TEST_TOKENS.invalid }));
  expect(screen.getByText(en.Auth.passwordResetSuccess)).toBeInTheDocument();

  mocks.token = TEST_TOKENS.generic;
  view.rerender(page());
  expect(screen.getByRole("button", { name: TEST_TOKENS.generic })).toBeInTheDocument();
  await act(() => vi.advanceTimersByTime(3000));
  expect(mocks.router.push).not.toHaveBeenCalled();
});
