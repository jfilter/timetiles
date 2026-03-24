/**
 * i18n provider for Payload admin custom components.
 *
 * Wraps admin components with NextIntlClientProvider so they can use
 * useTranslations(). Registered via admin.components.providers in
 * the Payload config.
 *
 * @module
 * @category Admin
 */
"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import en from "@/messages/en.json";

export const AdminI18nProvider = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={en}>
    {children}
  </NextIntlClientProvider>
);

export default AdminI18nProvider;
