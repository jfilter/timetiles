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

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

// Disable HIBP password check in unit tests by default: the policy makes a
// live fetch to api.pwnedpasswords.com, and any string the attacker corpus
// has ever seen (including ones used in fixtures) would flip a legitimate
// "valid password" test into a rejection. Tests that specifically exercise
// the HIBP path can stub this back on.
process.env.PASSWORD_HIBP_CHECK ??= "false";

// Reset cached config before each test so vi.stubEnv() changes take effect
beforeEach(() => {
  resetEnv();
  resetAppConfig();
});

// Set upload directory environment variables for unit tests
process.env.UPLOAD_DIR = `/tmp/uploads`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp`;

// Ensure upload directories exist for unit tests
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
