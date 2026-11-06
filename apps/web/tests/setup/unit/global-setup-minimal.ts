/**
 * Vitest setup for unit tests.
 *
 * Configures test environment for unit tests that don't require database
 * access. Sets up temporary directories and minimal environment variables.
 *
 * @module
 * @category Test Setup
 */
import fs from "node:fs";
import path from "node:path";

import { resetAppConfig } from "@/lib/config/app-config";
import { resetEnv } from "@/lib/config/env";

if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

// HIBP check off by default: the policy fetches api.pwnedpasswords.com live, and any string
// in the breach corpus (fixtures included) would reject a valid-password test. Tests of the
// HIBP path stub it back on.
process.env.PASSWORD_HIBP_CHECK ??= "false";

// Reset cached config before each test so vi.stubEnv() changes take effect
beforeEach(() => {
  resetEnv();
  resetAppConfig();
});

process.env.UPLOAD_DIR = `/tmp/uploads`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp`;

const uploadDirs = [
  `${process.env.UPLOAD_DIR}/media`,
  `${process.env.UPLOAD_DIR}/ingest-files`,
  process.env.UPLOAD_TEMP_DIR,
];

uploadDirs.forEach((dir) => {
  const fullPath = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});
