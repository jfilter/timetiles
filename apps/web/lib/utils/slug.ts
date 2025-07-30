/**
 * Provides utility functions for generating and validating URL-friendly slugs.
 *
 * This module contains helpers for creating unique, SEO-friendly slugs from a given
 * string (like a title or name). It includes functionality to:
 * - Sanitize a string into a basic slug format.
 * - Check for the uniqueness of a slug within a specific collection to prevent duplicates.
 * - Generate a unique slug by appending a random suffix if a conflict is found.
 * - A factory function (`createSlugHook`) to easily integrate this logic into Payload CMS
 *   collection field hooks.
 * 
 * @category Utilities
 * @module
 */
import { randomBytes } from "crypto";
import type { PayloadRequest } from "payload";

import type { Config } from "@/payload-types";

/**
 * Generates a basic slug from a string by:
 * - Converting to lowercase
 * - Replacing non-alphanumeric characters with hyphens
 * - Removing leading/trailing hyphens
 */
export const generateSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Generates a unique slug by checking for existing slugs and appending random suffixes if needed
 */
export const generateUniqueSlug = async <T extends keyof Config["collections"]>(
  baseText: string,
  collection: T,
  req: PayloadRequest,
  currentId?: string | number,
): Promise<string> => {
  const baseSlug = generateSlug(baseText);

  // Check if the base slug is available
  const isUnique = await checkSlugUniqueness(baseSlug, collection, req, currentId);

  if (isUnique) {
    return baseSlug;
  }

  // Generate variations until we find a unique one
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const suffix = generateRandomSuffix();
    const candidateSlug = `${baseSlug}-${suffix}`;

    const isUnique = await checkSlugUniqueness(candidateSlug, collection, req, currentId);

    if (isUnique) {
      return candidateSlug;
    }

    attempts++;
  }

  // Fallback: use timestamp if all random attempts fail
  const timestamp = Date.now().toString(36);
  return `${baseSlug}-${timestamp}`;
};

/**
 * Checks if a slug is unique in the given collection
 */
const checkSlugUniqueness = async <T extends keyof Config["collections"]>(
  slug: string,
  collection: T,
  req: PayloadRequest,
  currentId?: string | number,
): Promise<boolean> => {
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
};

/**
 * Generates a cryptographically secure random suffix for slug uniqueness
 * Uses crypto.randomBytes for better randomness
 */
const generateRandomSuffix = (): string => {
  // Generate 4 random bytes and convert to hex (8 characters)
  return randomBytes(4).toString("hex");
};

/**
 * Hook function to be used in Payload collection field hooks
 * 
 * @param collection - The collection name
 * @param options - Optional object with sourceField (dot notation)
 */
export const createSlugHook =
  <T extends keyof Config["collections"]>(collection: T, options?: { sourceField?: string }) =>
  async ({
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
    const sourceValue = getSourceValue(data, options?.sourceField);

    // Generate new slug from source value
    if (shouldGenerateFromSource(value, sourceValue, operation)) {
      return generateSlugFromSource(sourceValue as string, collection, req, operation, originalDoc);
    }

    // Update existing slug with uniqueness check
    if (shouldValidateExistingSlug(value, operation, req)) {
      return validateAndUpdateSlug(value!, collection, req!, originalDoc);
    }

    return value;
  };

// Helper functions to reduce cognitive complexity
const getSourceValue = (data: Record<string, unknown> | undefined, sourceField: string | undefined): unknown => {
  const getNested = createNestedValueGetter();
  let sourceValue = data?.name;
  if (sourceField != null && sourceField != undefined && sourceField !== "" && data != null && data != undefined) {
    sourceValue = getNested(data, sourceField);
  }
  return sourceValue;
};

const shouldGenerateFromSource = (
  value: string | undefined,
  sourceValue: unknown,
  operation: string | undefined,
): boolean =>
  (value == null || value == undefined || value === "") &&
  sourceValue != null &&
  sourceValue != undefined &&
  sourceValue !== "" &&
  (operation === "create" || operation === "update");

const shouldValidateExistingSlug = (
  value: string | undefined,
  operation: string | undefined,
  req: PayloadRequest | undefined,
): boolean =>
  value != null && value != undefined && value !== "" && operation === "update" && req != null && req != undefined;

const generateSlugFromSource = async (
  sourceValue: string,
  collection: string,
  req: PayloadRequest | undefined,
  operation: string | undefined,
  originalDoc: Record<string, unknown> | undefined,
): Promise<string> => {
  // For tests, generate simple slug without async uniqueness check
  if (!req) {
    return generateSlug(sourceValue);
  }

  const currentId = operation === "update" ? (originalDoc?.id as string | number | undefined) : undefined;

  try {
    return await generateUniqueSlug(sourceValue, collection as keyof Config["collections"], req, currentId);
  } catch {
    // Fallback to simple generation if uniqueness check fails
    return generateSlug(sourceValue) + "-" + Date.now();
  }
};

const validateAndUpdateSlug = async (
  value: string,
  collection: string,
  req: PayloadRequest,
  originalDoc: Record<string, unknown> | undefined,
): Promise<string> => {
  try {
    const currentId = originalDoc?.id as string | number | undefined;
    const isUnique = await checkSlugUniqueness(value, collection as keyof Config["collections"], req, currentId);
    if (!isUnique) {
      return await generateUniqueSlug(value, collection as keyof Config["collections"], req, currentId);
    }
    return value;
  } catch {
    // Fallback to simple generation if uniqueness check fails
    return value + "-" + Date.now();
  }
};

const createNestedValueGetter =
  (): ((obj: Record<string, unknown>, path: string) => unknown) =>
  (obj: Record<string, unknown>, path: string): unknown => {
    return path
      .split(".")
      .reduce(
        (o: unknown, k) =>
          o != null && typeof o === "object" && k in o ? (o as Record<string, unknown>)[k] : undefined,
        obj,
      );
  };
