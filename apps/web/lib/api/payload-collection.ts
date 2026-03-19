/**
 * Shared utility for fetching Payload CMS collection documents.
 *
 * Eliminates the repeated `fetchJson<{ docs: T[] }>(url).docs` pattern
 * across collection query hooks.
 *
 * @module
 * @category API
 */
import { fetchJson } from "@/lib/api/http-error";

/**
 * Fetch documents from a Payload CMS collection endpoint.
 *
 * @param url - API URL including query parameters (e.g., "/api/scrapers?sort=-updatedAt&limit=200")
 * @returns Array of documents from the `docs` field
 */
export const fetchCollectionDocs = async <T>(url: string): Promise<T[]> => {
  const data = await fetchJson<{ docs: T[] }>(url, { credentials: "include" });
  return data.docs;
};
