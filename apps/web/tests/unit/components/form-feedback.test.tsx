/**
 * Announcement and localization of shared form feedback.
 *
 * @module
 * @category Tests
 */
import { fireEvent, screen } from "@testing-library/react";
import { useLocale } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormError, FormSuccess } from "@/components/auth/form-feedback";
import { LoginForm } from "@/components/auth/login-form";
import { HttpError } from "@/lib/api/http-error";
import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

import de from "../../../messages/de.json";
import { renderWithProviders } from "../../setup/unit/react-render";

const mocks = vi.hoisted(() => ({ loginRequest: vi.fn() }));
vi.mock("@/lib/hooks/use-auth-mutations", () => mocks);

describe("FormSuccess (inline)", () => {
  it("keeps a status live region mounted so the message is announced when it appears", () => {
    const { rerender } = renderWithProviders(<FormSuccess show={false} message="Password changed" />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    rerender(<FormSuccess show message="Password changed" />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Password changed");
  });
});

describe("FormError", () => {
  beforeEach(() => vi.mocked(useLocale).mockReturnValue("de"));

  it("shows a German message for an English server error in the German UI", () => {
    renderWithProviders(<FormError error={new HttpError(429, "Too many requests, slow down")} />, {
      locale: "de",
      messages: de,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(de.Errors.tooManyRequests);
  });
});

describe("LoginForm", () => {
  beforeEach(() => vi.mocked(useLocale).mockReturnValue("de"));

  it("explains rejected credentials in German", async () => {
    mocks.loginRequest.mockRejectedValueOnce(new HttpError(401, "The email or password provided is incorrect."));
    renderWithProviders(<LoginForm />, { locale: "de", messages: de });

    fireEvent.change(screen.getByLabelText(de.Auth.emailLabel), { target: { value: TEST_EMAILS.user } });
    fireEvent.change(screen.getByLabelText(de.Auth.passwordLabel), {
      target: { value: TEST_CREDENTIALS.basic.strongPassword },
    });
    fireEvent.click(screen.getByRole("button", { name: de.Common.signIn }));

    expect(await screen.findByRole("alert")).toHaveTextContent(de.Auth.invalidCredentials);
  });
});
