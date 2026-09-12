/**
 * Reset form feedback and retry behavior with real React Query mutation state.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { HttpError } from "@/lib/api/http-error";
import { TEST_CREDENTIALS, TEST_TOKENS } from "@/tests/constants/test-credentials";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ resetPasswordRequest: vi.fn() }));
vi.mock("@/lib/hooks/use-auth-mutations", () => mocks);

describe.each([
  { locale: "en", messages: en },
  { locale: "de", messages: de },
])("ResetPasswordForm ($locale)", ({ locale, messages }) => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  const renderForm = () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ResetPasswordForm token={TEST_TOKENS.generic} onSuccess={onSuccess} onError={onError} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText(messages.Auth.newPasswordLabel), {
      target: { value: TEST_CREDENTIALS.basic.strongPassword },
    });
    fireEvent.change(screen.getByLabelText(messages.Auth.confirmPasswordLabel), {
      target: { value: TEST_CREDENTIALS.basic.strongPassword },
    });
    return { onSuccess, onError };
  };

  it("keeps a failed reset visible and allows a successful retry", async () => {
    const error = new HttpError(503, "Password reset temporarily unavailable.");
    mocks.resetPasswordRequest.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const { onSuccess, onError } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: messages.Auth.resetPassword }));
    expect(await screen.findByRole("alert")).toHaveTextContent(error.message);
    expect(onError).toHaveBeenCalledWith(error.message);
    expect(onSuccess).not.toHaveBeenCalled();
    const retry = screen.getByRole("button", { name: messages.Auth.resetPassword });
    expect(retry).toBeEnabled();

    fireEvent.click(retry);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.resetPasswordRequest).toHaveBeenCalledTimes(2);
    expect(mocks.resetPasswordRequest).toHaveBeenLastCalledWith({
      token: TEST_TOKENS.generic,
      password: TEST_CREDENTIALS.basic.strongPassword,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("localizes mismatched passwords without sending a request", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(messages.Auth.confirmPasswordLabel), {
      target: { value: TEST_CREDENTIALS.auth.newSecure },
    });

    fireEvent.click(screen.getByRole("button", { name: messages.Auth.resetPassword }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.Auth.passwordsDoNotMatch);
    expect(mocks.resetPasswordRequest).not.toHaveBeenCalled();
  });
});
