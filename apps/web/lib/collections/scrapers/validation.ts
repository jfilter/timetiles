/**
 * Validation helpers for the scrapers collection.
 *
 * Pure functions that validate entrypoint paths, environment variable objects,
 * and repo ownership. No side effects beyond the ownership DB lookup.
 *
 * @module
 */
import { isPrivileged } from "@/lib/collections/shared-fields";
import { extractRelationId } from "@/lib/utils/relation-id";

/** Reserved environment variable prefixes that must not be overridden by scrapers. */
export const RESERVED_ENV_PREFIXES = [
  "PAYLOAD_",
  "DATABASE_",
  "POSTGRES_",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "SCRAPER_",
  "NODE_",
  "SECRET",
];

/** Maximum number of environment variables per scraper. */
export const MAX_ENV_VARS = 50;

/** Valid environment variable key pattern. */
export const ENV_KEY_PATTERN = /^[A-Za-z_]\w*$/;

/**
 * Validates entrypoint path to prevent path traversal and absolute paths.
 */
export const validateEntrypoint = (value: unknown): string | true => {
  if (!value || typeof value !== "string") return "Entrypoint is required";
  if (value.includes("..")) return "Entrypoint must not contain path traversal (..)";
  if (value.startsWith("/")) return "Entrypoint must be a relative path";
  if (value.includes("\0")) return "Entrypoint contains invalid characters";
  if (value.length > 255) return "Entrypoint must be at most 255 characters";
  return true;
};

/**
 * Validates environment variables object for safe keys and values.
 */
export const validateEnvVars = (value: unknown): string | true => {
  if (value == null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return true; // Allow empty/null
  }
  if (typeof value !== "object" || Array.isArray(value)) return "Environment variables must be an object";
  const entries = Object.entries(value);
  if (entries.length > MAX_ENV_VARS) return `Maximum ${MAX_ENV_VARS} environment variables allowed`;
  for (const [key] of entries) {
    if (!ENV_KEY_PATTERN.test(key))
      return `Invalid environment variable key: "${key}". Keys must match [A-Za-z_][A-Za-z0-9_]*`;
    if (RESERVED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      return `Reserved environment variable prefix: "${key}". Keys starting with ${RESERVED_ENV_PREFIXES.join(", ")} are not allowed`;
    }
  }
  return true;
};

/**
 * Looks up a repo by ID, validates the current user owns it (unless privileged),
 * and returns the repo owner's ID for denormalized storage.
 */
export const resolveRepoOwner = async (
  payload: {
    findByID: (args: {
      collection: "scraper-repos";
      id: number;
      overrideAccess: boolean;
    }) => Promise<{ createdBy?: unknown }>;
  },
  repoId: number,
  user: { id: number; role?: string | null } | undefined,
  errorMessage: string
): Promise<number | undefined> => {
  const repo = await payload.findByID({ collection: "scraper-repos", id: repoId, overrideAccess: true });
  if (!repo) {
    throw new Error("Scraper repo not found");
  }
  const repoOwnerId = extractRelationId(repo.createdBy) as number | undefined;
  if (user && !isPrivileged(user) && repoOwnerId !== user.id) {
    throw new Error(errorMessage);
  }
  return repoOwnerId;
};
