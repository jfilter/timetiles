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
 * Derive a test database URL from a base URL
 *
 * @param baseUrl - The base database URL
 * @param workerId - Optional worker ID for parallel test execution
 * @returns The test database URL
 *
 * @example
 * ```typescript
 * // For unit/integration tests (worker-specific)
 * const testUrl = deriveTestDatabaseUrl(process.env.DATABASE_URL, "1");
 * // Returns: postgresql://user:pass@host:5432/mydb_test_1
 * ```
 */
export const deriveTestDatabaseUrl = (baseUrl: string, workerId?: string): string => {
  const components = parseDatabaseUrl(baseUrl);
  const baseName = components.database;

  // Add _test suffix if not already present
  const testBaseName = baseName.endsWith("_test") ? baseName : `${baseName}_test`;

  // Add worker ID if provided
  const testDbName = workerId ? `${testBaseName}_${workerId}` : testBaseName;

  return constructDatabaseUrl({
    ...components,
    database: testDbName,
  });
};

/**
 * Derive an E2E test database URL from a base URL
 *
 * Creates a dedicated database for E2E tests with _test_e2e suffix
 * to distinguish from unit/integration test databases.
 *
 * @param baseUrl - The base database URL
 * @returns The E2E test database URL
 *
 * @example
 * ```typescript
 * const e2eUrl = deriveE2eDatabaseUrl(process.env.DATABASE_URL);
 * // Returns: postgresql://user:pass@host:5432/mydb_test_e2e
 * ```
 */
export const deriveE2eDatabaseUrl = (baseUrl: string): string => {
  const components = parseDatabaseUrl(baseUrl);
  const baseName = components.database;

  // Remove any existing _test suffix to avoid duplication
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple bounded regex for database name cleanup
  const cleanBaseName = baseName.replace(/_test(_\d+)?$/, "");

  // Add _test_e2e suffix for E2E tests
  const e2eDbName = `${cleanBaseName}_test_e2e`;

  return constructDatabaseUrl({
    ...components,
    database: e2eDbName,
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

  return deriveTestDatabaseUrl(baseUrl, workerId);
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
