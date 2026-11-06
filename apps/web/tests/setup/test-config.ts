/**
 * Payload configuration for tests.
 *
 * @module
 * @category Test Setup
 */
import { buildConfigWithDefaults, type PayloadConfigOptions } from "@/lib/config/payload-config-factory";

/** Payload test configuration with GraphQL disabled and a small pool. */
export const createTestConfig = async (options: Partial<PayloadConfigOptions> = {}) =>
  buildConfigWithDefaults({
    environment: "test",
    disableGraphQL: true,
    logLevel: "silent",
    poolConfig: { max: 5 },
    ...options,
  });
