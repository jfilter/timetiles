/**
 * Hook for testing geocoding providers from the Payload admin panel.
 *
 * Uses plain useState/useCallback instead of React Query because the
 * Payload admin panel has no QueryClientProvider.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useState } from "react";

import { fetchJson } from "@/lib/api/http-error";

export interface TestResult {
  success: boolean;
  result?: { latitude: number; longitude: number; confidence: number; normalizedAddress: string };
  error?: string;
}

export interface TestResults {
  google?: TestResult;
  nominatim?: TestResult;
  opencage?: TestResult;
}

export const useGeocodingTest = () => {
  const [isPending, setIsPending] = useState(false);
  const [data, setData] = useState<TestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (address: string) => {
    if (!address.trim()) return;

    setIsPending(true);
    setError(null);

    try {
      const results = await fetchJson<TestResults>("/api/geocoding/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      setData(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutate, isPending, data, error };
};
