/**
 * React Testing Library utilities.
 *
 * Provides custom render function with all necessary providers for
 * component testing including React Query, theme, and URL state management.
 *
 * @module
 * @category Test Setup
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import React from "react";

import { ThemeProvider } from "@/components/theme-provider";

import en from "../../../messages/en.json";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  searchParams?: URLSearchParams;
  locale?: string;
  messages?: Record<string, unknown>;
}

const defaultSearchParams = new URLSearchParams();

const AllTheProviders = ({
  children,
  searchParams = defaultSearchParams,
  locale = "en",
  messages = en,
}: {
  children: React.ReactNode;
  searchParams?: URLSearchParams;
  locale?: string;
  messages?: Record<string, unknown>;
}) => {
  // Create a new QueryClient for each test to avoid cross-test pollution
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false, // Disable retries in tests
            gcTime: 0, // Disable caching in tests
          },
        },
      })
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams={searchParams}>
          <ThemeProvider>{children}</ThemeProvider>
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
};

export const renderWithProviders = (ui: React.ReactElement, options?: CustomRenderOptions): RenderResult => {
  const { searchParams, locale, messages, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders searchParams={searchParams} locale={locale} messages={messages}>
        {children}
      </AllTheProviders>
    ),
    ...renderOptions,
  });
};

// MapLibre GL is mocked globally in setup-components.ts

// Re-export everything
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
