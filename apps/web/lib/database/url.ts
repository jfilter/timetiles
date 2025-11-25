/**
 * Database URL utility functions.
 *
 * Provides utilities for parsing, constructing, and deriving database URLs
 * for different environments (development, test, production).
 *
 * @module
 * @category Utils
 */

/**
 * Parsed database URL components
 */
export interface DatabaseUrlComponents {
  username: string;
  password: string;
  host: string;
  port: string;
  database: string;
  fullUrl: string;
}

/**
 * Parse a database URL into its components
 */
export const parseDatabaseUrl = (url: string): DatabaseUrlComponents => {
  const urlParts = new URL(url);

  return {
    username: urlParts.username,
    password: urlParts.password,
    host: urlParts.hostname,
    port: urlParts.port || "5432",
    database: urlParts.pathname.slice(1), // Remove leading slash
    fullUrl: url,
  };
};

/**
 * Construct a database URL from components
 */
export const constructDatabaseUrl = (components: Omit<DatabaseUrlComponents, "fullUrl">): string => {
  const { username, password, host, port, database } = components;
  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

/**
 * Options for deriving database URLs
 */
export interface DeriveDatabaseUrlOptions {
  /**
   * Optional worker ID for parallel test execution
   */
  workerId?: string;
}

/**
 * Derive test database URL from a base URL for unit/integration tests
 *
 * This function creates worker-specific test database URLs for parallel test execution.
 * For E2E tests, use getE2ETestDatabaseConfig() instead.
 *
 * @param baseUrl - The base database URL
 * @param options - Configuration options for database derivation
 * @returns The derived test database URL
 *
 * @example
 * ```typescript
 * // Test database with worker ID
 * deriveDatabaseUrl(baseUrl, { workerId: '1' });
 * // Returns: postgresql://user:pass@host:5432/mydb_test_1
 *
 * // Test database without worker ID
 * deriveDatabaseUrl(baseUrl, {});
 * // Returns: postgresql://user:pass@host:5432/mydb_test
 * ```
 */
export const deriveDatabaseUrl = (baseUrl: string, options: DeriveDatabaseUrlOptions = {}): string => {
  const components = parseDatabaseUrl(baseUrl);
  let baseName = components.database;

  // Remove any existing _test suffix to avoid duplication
  // Matches: _test, _test_1, etc.
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple bounded regex for database name cleanup
  baseName = baseName.replace(/_test(_\d+)?$/, "");

  // Add _test suffix
  const testBaseName = `${baseName}_test`;

  // Add worker ID if provided
  const derivedName = options.workerId ? `${testBaseName}_${options.workerId}` : testBaseName;

  return constructDatabaseUrl({
    ...components,
    database: derivedName,
  });
};

/**
 * Get database URL from environment with validation
 *
 * @param required - Whether to throw if not found (default: true)
 * @returns The database URL or undefined if not required and not found
 * @throws Error if required but not found
 */
export const getDatabaseUrl = (required: boolean = true): string | undefined => {
  const url = process.env.DATABASE_URL;

  if (!url && required) {
    throw new Error(
      "DATABASE_URL environment variable is required. " +
        "Please set DATABASE_URL in your .env.local file. " +
        "Example: DATABASE_URL=postgresql://user:password@localhost:5432/database"
    );
  }

  return url;
};

/**
 * Get test database URL for current worker
 *
 * @returns The test database URL for the current worker
 */
export const getTestDatabaseUrl = (): string => {
  const baseUrl = getDatabaseUrl(true)!;
  const workerId = process.env.VITEST_WORKER_ID;

  return deriveDatabaseUrl(baseUrl, { workerId });
};

/**
 * Check if a database URL points to a test database
 */
export const isTestDatabase = (url: string): boolean => {
  const { database } = parseDatabaseUrl(url);
  return database.includes("_test");
};

/**
 * Get database connection info for logging (without password)
 */
export const getDatabaseInfo = (url: string): Omit<DatabaseUrlComponents, "password" | "fullUrl"> => {
  const components = parseDatabaseUrl(url);
  const { password, fullUrl, ...safeInfo } = components;
  return safeInfo;
};
