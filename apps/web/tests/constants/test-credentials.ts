/**
 * Test credentials for use in integration and unit tests.
 * These are not real credentials and are only used in test environments.
 * Centralizing them here helps avoid SonarCloud security warnings.
 *
 * @module
 */

export const TEST_CREDENTIALS = {
  basic: {
    username: "testuser",
    password: "testpass",
    alternateUsername: "user",
    alternatePassword: "pass",
    // For security tests requiring a "strong-looking" password
    strongPassword: "password123",
    superSecretPassword: "super-secret-password",
  },
  bearer: {
    token: "test-api-token-123",
    alternateToken: "test-bearer-token",
    // JWT-like tokens for authentication tests
    jwtInvalid: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.token",
    jwtSecret: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret-token",
    // Additional bearer tokens for various test scenarios
    superSecretToken: "super-secret-token-12345",
    tokenAbc: "token-abc-123",
  },
  apiKey: {
    key: "test-api-key-456",
    alternateKey: "test-key-123",
    customKey: "key-123",
    secretKey: "secret-key-123",
    shortSecretKey: "secret-key",
  },
  database: {
    password: "test123456",
  },
} as const;

// Additional test tokens
export const TEST_TOKENS = {
  webhook: "test-webhook-token-789",
  webhookTest: "test_token_123",
  webhookOld: "old_token_123",
  webhookExisting: "existing_token_123",
  webhookShort: "test_token",
  invalid: "invalid_token_123456",
  generic: "token-123",
} as const;

// Test environment secrets
export const TEST_SECRETS = {
  payloadSecret: "test-secret-key",
} as const;

// Test user emails
export const TEST_EMAILS = {
  admin: "admin@example.com",
  user: "user@example.com",
  // Specialized test user emails
  performance: "perf-test@example.com",
  network: "network-test@example.com",
  integrity: "integrity-test@example.com",
  schedule: "schedule-test@example.com",
} as const;
