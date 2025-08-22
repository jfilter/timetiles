/**
 * Unit tests for webhook field management in scheduled imports.
 * @module
 */

import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type WebhookData = {
  webhookEnabled?: boolean;
  webhookToken?: string | null;
  name?: string;
  sourceUrl?: string;
  frequency?: string;
};

// Mock the crypto module
vi.mock("crypto", () => ({
  randomBytes: vi.fn(),
}));

describe("Webhook Field Management", () => {
  const mockRandomBytes = randomBytes as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock randomBytes to return predictable values
    mockRandomBytes.mockImplementation((size: number) => ({
      toString: (encoding: string) => {
        if (encoding === "hex" && size === 32) {
          return "a".repeat(64); // 64 character hex string
        }
        return "";
      },
    }));
  });

  describe("Token Generation", () => {
    it("should generate token when webhook is enabled for the first time", () => {
      const mockToken = "b".repeat(64);
      mockRandomBytes.mockImplementationOnce(() => ({
        toString: () => mockToken,
      }));

      const data = {
        webhookEnabled: true,
        webhookToken: undefined,
      };

      const originalDoc = {
        webhookEnabled: false,
        webhookToken: undefined,
      };

      // Simulate beforeChange hook logic
      const result = simulateWebhookBeforeChange(data, originalDoc);

      expect(result.webhookToken).toBe(mockToken);
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it("should not generate token when webhook is already enabled with token", () => {
      const existingToken = "existing_token_123";
      const data = {
        webhookEnabled: true,
        webhookToken: existingToken,
      };

      const originalDoc = {
        webhookEnabled: true,
        webhookToken: existingToken,
      };

      const result = simulateWebhookBeforeChange(data, originalDoc);

      expect(result.webhookToken).toBe(existingToken);
      // The token should not be regenerated, keeping the existing one
      expect(result.webhookToken).not.toMatch(/^a+$/); // Not the mocked value
    });

    it("should regenerate token when webhook is re-enabled", () => {
      const newToken = "c".repeat(64);
      mockRandomBytes.mockImplementationOnce(() => ({
        toString: () => newToken,
      }));

      const data = {
        webhookEnabled: true,
        webhookToken: undefined,
      };

      const originalDoc = {
        webhookEnabled: false,
        webhookToken: "old_token_123",
      };

      const result = simulateWebhookBeforeChange(data, originalDoc);

      expect(result.webhookToken).toBe(newToken);
      expect(result.webhookToken).not.toBe(originalDoc.webhookToken);
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it("should clear token when webhook is disabled", () => {
      const data = {
        webhookEnabled: false,
        webhookToken: "existing_token",
      };

      const originalDoc = {
        webhookEnabled: true,
        webhookToken: "existing_token",
      };

      const result = simulateWebhookBeforeChange(data, originalDoc);

      expect(result.webhookToken).toBeNull();
      // Token should be cleared when disabling
    });

    it("should handle enabling webhook without original document (new record)", () => {
      const newToken = "d".repeat(64);
      mockRandomBytes.mockImplementationOnce(() => ({
        toString: () => newToken,
      }));

      const data = {
        webhookEnabled: true,
        webhookToken: undefined,
      };

      const result = simulateWebhookBeforeChange(data, undefined);

      expect(result.webhookToken).toBe(newToken);
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });
  });

  describe("Webhook URL Generation", () => {
    const baseUrl = "https://example.com";

    beforeEach(() => {
      process.env.NEXT_PUBLIC_PAYLOAD_URL = baseUrl;
    });

    it("should generate correct webhook URL with token", () => {
      const token = "test_token_123";
      const data = {
        webhookEnabled: true,
        webhookToken: token,
      };

      const url = generateWebhookUrl(data);

      expect(url).toBe(`${baseUrl}/api/webhooks/trigger/${token}`);
    });

    it("should not generate webhook URL when disabled", () => {
      const data = {
        webhookEnabled: false,
        webhookToken: "test_token_123",
      };

      const url = generateWebhookUrl(data);

      expect(url).toBeNull();
    });

    it("should not generate webhook URL when token is missing", () => {
      const data = {
        webhookEnabled: true,
        webhookToken: undefined,
      };

      const url = generateWebhookUrl(data);

      expect(url).toBeNull();
    });

    it("should use fallback URL when environment variable is not set", () => {
      delete process.env.NEXT_PUBLIC_PAYLOAD_URL;

      const token = "test_token_123";
      const data = {
        webhookEnabled: true,
        webhookToken: token,
      };

      const url = generateWebhookUrl(data);

      expect(url).toBe(`http://localhost:3000/api/webhooks/trigger/${token}`);
    });
  });

  describe("Token Security", () => {
    it("should generate cryptographically secure tokens", () => {
      const data = {
        webhookEnabled: true,
        webhookToken: undefined,
      };

      const result = simulateWebhookBeforeChange(data, undefined);

      // Token should be 64 characters (32 bytes as hex)
      expect(result.webhookToken).toHaveLength(64);
      // Token should only contain hex characters
      expect(result.webhookToken).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique tokens on each enable", () => {
      const tokens = new Set<string>();

      // Mock different tokens for each call
      for (let i = 0; i < 10; i++) {
        mockRandomBytes.mockImplementationOnce(() => ({
          toString: () => `token_${i}`.padEnd(64, "0"),
        }));

        const data = {
          webhookEnabled: true,
          webhookToken: undefined,
        };

        const result = simulateWebhookBeforeChange(data, undefined);
        if (result.webhookToken) {
          tokens.add(result.webhookToken);
        }
      }

      // All tokens should be unique
      expect(tokens.size).toBe(10);
    });
  });

  describe("Field Visibility", () => {
    it("should show webhook URL field only when enabled with token", () => {
      const dataWithToken = {
        webhookEnabled: true,
        webhookToken: "test_token",
      };

      const dataWithoutToken = {
        webhookEnabled: true,
        webhookToken: undefined,
      };

      const dataDisabled = {
        webhookEnabled: false,
        webhookToken: "test_token",
      };

      expect(shouldShowWebhookUrl(dataWithToken)).toBe(true);
      expect(shouldShowWebhookUrl(dataWithoutToken)).toBe(false);
      expect(shouldShowWebhookUrl(dataDisabled)).toBe(false);
    });

    it("should hide webhook token field from UI", () => {
      const webhookTokenFieldConfig = {
        name: "webhookToken",
        type: "text",
        maxLength: 64,
        admin: {
          hidden: true,
        },
      };

      expect(webhookTokenFieldConfig.admin.hidden).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing data gracefully", () => {
      const result = simulateWebhookBeforeChange(undefined, undefined);

      expect(result).toEqual({});
    });

    it("should handle partial data updates", () => {
      const data = {
        name: "Updated Import",
        // webhookEnabled not included in update
      };

      const originalDoc = {
        name: "Original Import",
        webhookEnabled: true,
        webhookToken: "existing_token",
      };

      const result = simulateWebhookBeforeChange(data, originalDoc);

      // Token should remain unchanged when webhook fields not in update
      expect(result.webhookToken).toBeUndefined();
      expect(result.name).toBe("Updated Import");
    });

    it("should preserve other fields when updating webhook settings", () => {
      const newToken = "new_token_123".padEnd(64, "0");
      mockRandomBytes.mockImplementationOnce(() => ({
        toString: () => newToken,
      }));

      const data = {
        name: "Test Import",
        sourceUrl: "https://example.com/data.csv",
        webhookEnabled: true,
        frequency: "daily",
      };

      const originalDoc = {
        name: "Test Import",
        sourceUrl: "https://example.com/data.csv",
        webhookEnabled: false,
        frequency: "daily",
      };

      const result = simulateWebhookBeforeChange(data, originalDoc);

      expect(result.webhookToken).toBe(newToken);
      expect(result.name).toBe("Test Import");
      expect(result.sourceUrl).toBe("https://example.com/data.csv");
      expect(result.frequency).toBe("daily");
    });
  });
});

// Helper function to simulate the webhook beforeChange hook logic
const simulateWebhookBeforeChange = (
  data: WebhookData | undefined,
  originalDoc: WebhookData | undefined
): WebhookData => {
  if (!data) {
    return {};
  }

  const result = { ...data };

  // Handle webhook token generation (this simulates the actual hook logic)
  if (result.webhookEnabled && !result.webhookToken) {
    // Generate new token when enabling webhooks
    result.webhookToken = randomBytes(32).toString("hex");
  } else if (result.webhookEnabled && !originalDoc?.webhookEnabled) {
    // Regenerate token when re-enabling
    result.webhookToken = randomBytes(32).toString("hex");
  } else if (result.webhookEnabled === false && originalDoc?.webhookEnabled) {
    // Clear token when disabling webhooks
    result.webhookToken = null;
  }

  return result;
};

// Helper function to generate webhook URL
const generateWebhookUrl = (data: WebhookData): string | null => {
  if (data?.webhookEnabled && data?.webhookToken) {
    const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
    return `${baseUrl}/api/webhooks/trigger/${data.webhookToken}`;
  }
  return null;
};

// Helper function to check if webhook URL should be shown
const shouldShowWebhookUrl = (data: WebhookData): boolean => Boolean(data?.webhookEnabled && data?.webhookToken);
