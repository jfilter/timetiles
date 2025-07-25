import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import React from "react";

import { ThemeProvider } from "@/components/theme-provider";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  searchParams?: URLSearchParams;
}

const AllTheProviders = ({
  children,
  searchParams = new URLSearchParams(),
}: {
  children: React.ReactNode;
  searchParams?: URLSearchParams;
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
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter searchParams={searchParams}>
        <ThemeProvider>{children}</ThemeProvider>
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
};

export const renderWithProviders = (
  ui: React.ReactElement,
  options?: CustomRenderOptions,
): ReturnType<typeof render> => {
  const { searchParams, ...renderOptions } = options || {};

  return render(ui, {
    wrapper: ({ children }) => <AllTheProviders searchParams={searchParams}>{children}</AllTheProviders>,
    ...renderOptions,
  });
};

// MapLibre GL is mocked globally in setup-components.ts

// Re-export everything
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
