/**
 * Localized messages for failed API requests.
 *
 * Server error texts are written in English. Requests that fail with a stable
 * error code or HTTP status are mapped to `Errors.*` messages, so non-English
 * locales never show the raw server text.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import { HttpError } from "@/lib/api/http-error";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/security/password-policy-constants";

/** Locale the server writes its error messages in. */
const SERVER_MESSAGE_LOCALE = "en";

type ErrorsTranslator = ReturnType<typeof useTranslations<"Errors">>;

export interface ErrorMessageOptions {
  /** Context-specific message used when neither the error code nor the status is more specific. */
  fallback?: string;
  /** Context-specific messages per HTTP status, e.g. 401 on a login form. */
  byStatus?: Partial<Record<number, string>>;
}

const errorCode = (error: HttpError): string | null => {
  const body = error.body;
  if (typeof body !== "object" || body === null || !("code" in body)) return null;
  return typeof body.code === "string" ? body.code : null;
};

/** Messages for codes that carry more meaning than their HTTP status. */
const codeMessage = (code: string | null, t: ErrorsTranslator): string | null => {
  switch (code) {
    case "password-too-short":
      return t("passwordTooShort", { length: PASSWORD_MIN_LENGTH });
    case "password-too-long":
      return t("passwordTooLong", { length: PASSWORD_MAX_LENGTH });
    case "password-compromised":
      return t("passwordCompromised");
    case "QUOTA_EXCEEDED":
      return t("quotaExceeded");
    case "EMAIL_DISABLED":
      return t("emailDisabled");
    default:
      return null;
  }
};

const statusMessage = (status: number, t: ErrorsTranslator): string | null => {
  if (status >= 500) return t("serverError");
  switch (status) {
    case 401:
      return t("unauthorized");
    case 403:
      return t("forbidden");
    case 404:
      return t("notFound");
    case 409:
      return t("conflict");
    case 410:
      return t("expired");
    case 413:
      return t("tooLarge");
    case 429:
      return t("tooManyRequests");
    default:
      return null;
  }
};

/** A request that never got an HTTP response (offline, DNS, CORS) rejects with a TypeError. */
const isNetworkFailure = (error: unknown): boolean => error instanceof TypeError;

/** Plain `Error`s are thrown by client code with a message already in the UI locale. */
const isClientMessage = (error: unknown): error is Error =>
  error instanceof Error && Object.getPrototypeOf(error) === Error.prototype && error.message.trim() !== "";

/**
 * Returns a formatter that turns a failed request into a message in the UI locale.
 *
 * HTTP errors: known error code, call-site status override, the server's own text when the UI
 * locale matches the server's, the HTTP status, the call-site fallback. Then network failures,
 * client-authored messages, the fallback, a generic message.
 */
export const useErrorMessage = () => {
  const t = useTranslations("Errors");
  const locale = useLocale();

  return useCallback(
    (error: unknown, options: ErrorMessageOptions | string = {}): string => {
      const { fallback, byStatus } = typeof options === "string" ? { fallback: options, byStatus: undefined } : options;
      if (error instanceof HttpError) {
        const byCode = codeMessage(errorCode(error), t);
        if (byCode) return byCode;
        const override = byStatus?.[error.status];
        if (override) return override;
        if (locale === SERVER_MESSAGE_LOCALE && error.message.trim()) return error.message;
        return statusMessage(error.status, t) ?? fallback ?? t("invalidRequest");
      }
      if (isNetworkFailure(error)) return t("network");
      if (isClientMessage(error)) return error.message;
      return fallback ?? t("unexpected");
    },
    [t, locale]
  );
};
