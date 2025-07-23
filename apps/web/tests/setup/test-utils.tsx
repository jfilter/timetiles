import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { ThemeProvider } from "@/components/ThemeProvider";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  searchParams?: URLSearchParams;
}

function AllTheProviders({
  children,
  searchParams = new URLSearchParams(),
}: {
  children: React.ReactNode;
  searchParams?: URLSearchParams;
}) {
  return (
    <NuqsTestingAdapter searchParams={searchParams}>
      <ThemeProvider>{children}</ThemeProvider>
    </NuqsTestingAdapter>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: CustomRenderOptions,
): ReturnType<typeof render> {
  const { searchParams, ...renderOptions } = options || {};

  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders searchParams={searchParams}>{children}</AllTheProviders>
    ),
    ...renderOptions,
  });
}

// MapLibre GL is mocked globally in setup-components.ts

// Re-export everything
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
