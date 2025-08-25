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
  },
  bearer: {
    token: "test-api-token-123",
    alternateToken: "test-bearer-token",
  },
  apiKey: {
    key: "test-api-key-456",
    alternateKey: "test-key-123",
    customKey: "key-123",
  },
  database: {
    password: "test123456",
  },
} as const;

// Additional test tokens
export const TEST_TOKENS = {
  webhook: "test-webhook-token-789",
  invalid: "invalid_token_123456",
  generic: "token-123",
} as const;

// Test environment secrets
export const TEST_SECRETS = {
  payloadSecret: "test-secret-key",
} as const;
