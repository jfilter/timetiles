import type { PayloadRequest } from "payload";

import type { Config } from "../../payload-types";

/**
 * Generates a basic slug from a string by:
 * - Converting to lowercase
 * - Replacing non-alphanumeric characters with hyphens
 * - Removing leading/trailing hyphens
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Generates a unique slug by checking for existing slugs and appending random suffixes if needed
 */
export async function generateUniqueSlug<T extends keyof Config["collections"]>(
  baseText: string,
  collection: T,
  req: PayloadRequest,
  currentId?: string | number,
): Promise<string> {
  const baseSlug = generateSlug(baseText);

  // Check if the base slug is available
  const isUnique = await checkSlugUniqueness(
    baseSlug,
    collection,
    req,
    currentId,
  );

  if (isUnique) {
    return baseSlug;
  }

  // Generate variations until we find a unique one
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const suffix = generateRandomSuffix();
    const candidateSlug = `${baseSlug}-${suffix}`;

    const isUnique = await checkSlugUniqueness(
      candidateSlug,
      collection,
      req,
      currentId,
    );

    if (isUnique) {
      return candidateSlug;
    }

    attempts++;
  }

  // Fallback: use timestamp if all random attempts fail
  const timestamp = Date.now().toString(36);
  return `${baseSlug}-${timestamp}`;
}

/**
 * Checks if a slug is unique in the given collection
 */
async function checkSlugUniqueness<T extends keyof Config["collections"]>(
  slug: string,
  collection: T,
  req: PayloadRequest,
  currentId?: string | number,
): Promise<boolean> {
  const where = {
    slug: { equals: slug },
    ...(currentId != null && { id: { not_equals: currentId } }),
  };

  const result = await req.payload.find({
    collection,
    where,
    limit: 1,
  });

  return result.docs.length === 0;
}

/**
 * Generates a random suffix for slug uniqueness
 * Uses a combination of random letters and numbers
 */
function generateRandomSuffix(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  // Generate a 6-character random suffix
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Hook function to be used in Payload collection field hooks
 * @param collection - The collection name
 * @param options - Optional object with sourceField (dot notation)
 */
export function createSlugHook<T extends keyof Config["collections"]>(
  collection: T,
  options?: { sourceField?: string },
) {
  return async ({
    value,
    data,
    req,
    operation,
    originalDoc,
  }: {
    value?: string;
    data?: Record<string, unknown>;
    req?: PayloadRequest;
    operation?: string;
    originalDoc?: Record<string, unknown>;
  }) => {
    // Helper to get nested value by dot notation
    const getNested = createNestedValueGetter();
    const sourceField = options?.sourceField;
    let sourceValue = data?.name;
    if (
      sourceField !== null &&
      sourceField !== undefined &&
      sourceField !== "" &&
      data !== null &&
      data !== undefined
    ) {
      sourceValue = getNested(data, sourceField);
    }
    if (
      (value === null || value === undefined || value === "") &&
      sourceValue !== null &&
      sourceValue !== undefined &&
      sourceValue !== "" &&
      (operation === "create" || operation === "update")
    ) {
      // For tests, generate simple slug without async uniqueness check
      if (!req) {
        return generateSlug(sourceValue as string);
      }

      const currentId =
        operation === "update"
          ? (originalDoc?.id as string | number | undefined)
          : undefined;

      try {
        return await generateUniqueSlug(
          sourceValue as string,
          collection,
          req,
          currentId,
        );
      } catch {
        // Fallback to simple generation if uniqueness check fails
        return generateSlug(sourceValue as string) + "-" + Date.now();
      }
    }
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      operation === "update" &&
      req !== null &&
      req !== undefined
    ) {
      try {
        const currentId = originalDoc?.id as string | number | undefined;
        const isUnique = await checkSlugUniqueness(
          value,
          collection,
          req,
          currentId,
        );
        if (!isUnique) {
          return await generateUniqueSlug(value, collection, req, currentId);
        }
      } catch {
        // Fallback to simple generation if uniqueness check fails
        return value + "-" + Date.now();
      }
    }
    return value;
  };
}

function createNestedValueGetter(): (obj: Record<string, unknown>, path: string) => unknown {
  return (obj: Record<string, unknown>, path: string): unknown => {
    return path
      .split(".")
      .reduce(
        (o: unknown, k) =>
          o !== null && o !== undefined && typeof o === "object" && k in o
            ? (o as Record<string, unknown>)[k]
            : undefined,
        obj,
      );
  };
}
