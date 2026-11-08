/**
 * Password managers rely on these attributes to fill and save the right credential.
 * @module
 * @category Tests
 */
import "@/tests/mocks/external/next-navigation";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeEmailForm } from "@/app/[locale]/(frontend)/(app)/account/settings/_components/change-email-form";
import { ChangePasswordForm } from "@/app/[locale]/(frontend)/(app)/account/settings/_components/change-password-form";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";

import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/hooks/use-feature-flags", () => ({ useFeatureEnabled: () => ({ isEnabled: true, isLoading: false }) }));
vi.mock("@/lib/hooks/use-legal-notices", () => ({ useLegalNotices: () => ({ data: undefined }) }));

const autocompleteOf = (form: ReactNode, id: string) => {
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {form}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return container.querySelector(`#${id}`)?.getAttribute("autocomplete");
};

describe("credential autofill attributes", () => {
  afterEach(cleanup);

  it.each([
    ["login-email", "username"],
    ["login-password", "current-password"],
  ])("LoginForm #%s is %s", (id, expected) => {
    expect(autocompleteOf(<LoginForm />, id)).toBe(expected);
  });

  it.each([
    ["register-email", "username"],
    ["register-password", "new-password"],
    ["register-confirm-password", "new-password"],
  ])("RegisterForm #%s is %s", (id, expected) => {
    expect(autocompleteOf(<RegisterForm />, id)).toBe(expected);
  });

  it.each([
    ["current-password", "current-password"],
    ["new-password", "new-password"],
    ["confirm-password", "new-password"],
  ])("ChangePasswordForm #%s is %s", (id, expected) => {
    expect(autocompleteOf(<ChangePasswordForm />, id)).toBe(expected);
  });

  it.each([
    ["new-email", "email"],
    ["email-password", "current-password"],
  ])("ChangeEmailForm #%s is %s", (id, expected) => {
    expect(autocompleteOf(<ChangeEmailForm currentEmail="a@example.org" />, id)).toBe(expected);
  });
});
