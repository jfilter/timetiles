import type { PayloadRequest } from "payload";

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
export async function generateUniqueSlug(
  baseText: string,
  collection: string,
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
async function checkSlugUniqueness(
  slug: string,
  collection: string,
  req: PayloadRequest,
  currentId?: string | number,
): Promise<boolean> {
  const where: any = { slug: { equals: slug } };

  // If we're updating an existing record, exclude it from the uniqueness check
  if (currentId) {
    where.id = { not_equals: currentId };
  }

  const result = await req.payload.find({
    collection: collection as any,
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
export function createSlugHook(
  collection: string,
  options?: { sourceField?: string },
) {
  return async ({ value, data, req, operation, originalDoc }: any) => {
    // Helper to get nested value by dot notation
    function getNested(obj: any, path: string): any {
      return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
    }
    const sourceField = options?.sourceField;
    let sourceValue = data?.name;
    if (sourceField) {
      sourceValue = getNested(data, sourceField);
    }
    if (
      !value &&
      sourceValue &&
      (operation === "create" || operation === "update")
    ) {
      const currentId = operation === "update" ? originalDoc?.id : undefined;
      return await generateUniqueSlug(sourceValue, collection, req, currentId);
    }
    if (value && operation === "update") {
      const currentId = originalDoc?.id;
      const isUnique = await checkSlugUniqueness(
        value,
        collection,
        req,
        currentId,
      );
      if (!isUnique) {
        return await generateUniqueSlug(value, collection, req, currentId);
      }
    }
    return value;
  };
}
