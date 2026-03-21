/**
 * React Query hook for accessing legal notice configuration.
 *
 * Provides cached access to legal page URLs and the optional
 * registration disclaimer for display on the registration form.
 *
 * @module
 * @category Hooks
 */
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { fetchJson } from "@/lib/api/http-error";

import { QUERY_PRESETS } from "./query-presets";

export interface LegalNotices {
  termsUrl: string | null;
  privacyUrl: string | null;
  registrationDisclaimer: string | null;
}

export const useLegalNotices = () => {
  const locale = useLocale();

  return useQuery({
    queryKey: ["legal-notices", locale],
    queryFn: () => fetchJson<LegalNotices>(`/api/legal-notices?locale=${locale}`),
    ...QUERY_PRESETS.stable,
  });
};
