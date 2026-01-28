/**
 * Root provider component for application context.
 *
 * Wraps the application with essential providers including React Query
 * for data fetching, Nuqs for URL state management, and theme context.
 * Configures query client with appropriate cache and retry settings.
 *
 * @module
 * @category Components
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, useState } from "react";

// Lazy load DevTools - only in development to reduce production bundle
const ReactQueryDevtools = dynamic(
  async () => {
    const mod = await import("@tanstack/react-query-devtools");
    return mod.ReactQueryDevtools;
  },
  { ssr: false }
);

import { ThemeProvider } from "./theme-provider";

export const Providers = ({ children }: Readonly<{ children: ReactNode }>) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 10 * 60 * 1000, // 10 minutes
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors except 429 (rate limit)
              if (error instanceof Error && "status" in error) {
                const status = (error as { status: number }).status;
                if (status >= 400 && status < 500 && status !== 429) {
                  return false;
                }
              }
              return failureCount < 3;
            },
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <ThemeProvider>{children}</ThemeProvider>
      </NuqsAdapter>
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};
