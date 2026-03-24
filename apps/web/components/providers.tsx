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
import { UIProvider } from "@timetiles/ui/provider";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, useState } from "react";

import { HttpError } from "@/lib/api/http-error";
import { PRESET_THEMES } from "@/lib/constants/theme-presets";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";

// Lazy load DevTools - only in development to reduce production bundle
const ReactQueryDevtools = dynamic(
  async () => {
    const mod = await import("@tanstack/react-query-devtools");
    return mod.ReactQueryDevtools;
  },
  { ssr: false }
);

import { ThemeProvider } from "./theme-provider";

/** Bridges next-themes and theme presets into the UI library's provider. */
const UIBridge = ({ children }: Readonly<{ children: ReactNode }>) => {
  const { theme } = useTheme();
  const { preset } = useThemePreset();
  const presetConfig = PRESET_THEMES[preset];

  return (
    <UIProvider
      resolveTheme={() => theme ?? "light"}
      lightChartTheme={presetConfig?.light}
      darkChartTheme={presetConfig?.dark}
      mapColors={presetConfig?.map}
    >
      {children}
    </UIProvider>
  );
};

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
              if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429) {
                return false;
              }
              return failureCount < 3;
            },
          },
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <ThemeProvider>
          <UIBridge>{children}</UIBridge>
        </ThemeProvider>
      </NuqsAdapter>
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};
