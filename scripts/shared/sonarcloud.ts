/**
 * SonarCloud Web API access shared by the SonarCloud scripts.
 *
 * @module
 * @category Scripts
 */
import { loadEnvFile } from "./load-env";

export const SONAR_API = "https://sonarcloud.io/api";
export const PAGE_SIZE = 100;

export interface SonarCredentials {
  token: string;
  projectKey: string;
}

interface Paged {
  paging: { total: number; pageIndex: number; pageSize: number };
}

/** Load `.env.local` and return the SonarCloud token and project key; both are required. */
export const readSonarCredentials = (): SonarCredentials => {
  loadEnvFile();
  const token = process.env.SONARCLOUD_TOKEN;
  const projectKey = process.env.SONARCLOUD_PROJECT_KEY;
  if (!token || !projectKey) {
    throw new Error("SONARCLOUD_TOKEN and SONARCLOUD_PROJECT_KEY must be set in .env.local");
  }
  return { token, projectKey };
};

/** GET a SonarCloud endpoint; a non-2xx response throws `<label> error: <status>`. */
export const fetchSonarJson = async <T>(url: string, headers: Record<string, string>, label: string): Promise<T> => {
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`${label} error: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

/** Collect the items of every page; `pageUrl` builds the URL for a 1-based page number. */
export const fetchAllPages = async <D extends Paged, T>(
  pageUrl: (page: number) => string,
  headers: Record<string, string>,
  label: string,
  items: (data: D) => T[]
): Promise<T[]> => {
  const all: T[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const data = await fetchSonarJson<D>(pageUrl(page), headers, label);
    all.push(...items(data));
    totalPages = Math.ceil(data.paging.total / data.paging.pageSize);
  }
  return all;
};
