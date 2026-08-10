/**
 * Loads `.env.local` from the current working directory into `process.env`.
 *
 * Skips blank lines and `#` comments; splits on the first `=` so values
 * containing `=` (e.g. tokens) are preserved intact.
 *
 * @module
 * @category Scripts
 */

import fs from "node:fs";
import path from "node:path";

export function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      if (line.trim() && !line.startsWith("#")) {
        const eqIndex = line.indexOf("=");
        if (eqIndex > 0) {
          const key = line.slice(0, eqIndex).trim();
          const value = line.slice(eqIndex + 1).trim();
          process.env[key] = value;
        }
      }
    });
  }
}
