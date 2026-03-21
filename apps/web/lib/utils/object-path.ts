/**
 * Dot-notation path utilities for nested object access.
 *
 * Provides get, set, and delete operations on objects using
 * dot-separated path strings (e.g., "user.email").
 *
 * @module
 * @category Utils
 */

/**
 * Get value at path using dot notation.
 *
 * Returns `undefined` if any part of the path doesn't exist.
 *
 * @example
 * ```typescript
 * const obj = { user: { email: "test@example.com" } };
 * getByPath(obj, "user.email"); // "test@example.com"
 * getByPath(obj, "user.phone"); // undefined
 * ```
 */
export const getByPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce((current: unknown, key: string) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && Object.hasOwn(current, key)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

/**
 * Set value at path using dot notation.
 *
 * Creates nested objects as needed along the path.
 * Mutates the input object in place.
 *
 * @example
 * ```typescript
 * const obj = {};
 * setByPath(obj, "user.email", "test@example.com");
 * // Result: { user: { email: "test@example.com" } }
 * ```
 */
export const setByPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    throw new Error(`Invalid path: ${path}`);
  }

  const target = keys.reduce((current: Record<string, unknown>, key: string) => {
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    return current[key] as Record<string, unknown>;
  }, obj);

  target[lastKey] = value;
};

/**
 * Delete value at path using dot notation.
 *
 * Removes the property at the specified path.
 * Does nothing if the path doesn't exist.
 *
 * @example
 * ```typescript
 * const obj = { user: { email: "test@example.com", name: "John" } };
 * deleteByPath(obj, "user.email");
 * // Result: { user: { name: "John" } }
 * ```
 */
export const deleteByPath = (obj: Record<string, unknown>, path: string): void => {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    return;
  }

  const parent = keys.reduce((current: unknown, key: string) => {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);

  if (parent && typeof parent === "object") {
    delete (parent as Record<string, unknown>)[lastKey];
  }
};
