#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// List of test files to process
const testFiles = [
  "network-error-tests.test.ts",
  "schedule-edge-cases.test.ts",
  "security-validation.test.ts",
  "performance-concurrency.test.ts",
];

// Common replacements for all files
const replacements = [
  // Remove nock imports
  { from: /import nock from 'nock';\n/g, to: "" },
  { from: /nock\.cleanAll\(\);\n/g, to: "" },

  // Add global fetch mock after imports if not present
  {
    from: /import type { ScheduledImport } from '@\/payload-types';\n(?!.*global\.fetch)/,
    to: `import type { ScheduledImport } from '@/payload-types';\n\n// Mock fetch globally\nglobal.fetch = vi.fn();\n`,
  },

  // Replace nock with fetch mocks - simple GET with status code
  {
    from: /nock\('([^']+)'\)\s*\.get\('([^']+)'\)\s*\.reply\((\d+)\);/g,
    to: `(global.fetch as any).mockResolvedValueOnce({
        ok: $3 < 400,
        status: $3,
        statusText: $3 === 404 ? 'Not Found' : $3 === 500 ? 'Internal Server Error' : 'OK',
        headers: new Headers(),
      } as Response);`,
  },

  // Replace nock with fetch mocks - GET with response body
  {
    from: /nock\('([^']+)'\)\s*\.get\('([^']+)'\)\s*\.reply\((\d+), '([^']+)'(?:, \{ 'Content-Type': '([^']+)' \})?\);/g,
    to: `(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: $3,
        headers: new Headers({ 'content-type': '$5' || 'text/plain' }),
        arrayBuffer: async () => Buffer.from('$4'),
      } as Response);`,
  },

  // beforeEach cleanup
  {
    from: /beforeEach\(\(\) => \{[\t\x0b\f\r \xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*\n\s*\}\);/g,
    to: `beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
  });`,
  },
];

// Process each file
testFiles.forEach((filename) => {
  const filepath = path.join(__dirname, filename);

  if (!fs.existsSync(filepath)) {
    console.log(`Skipping ${filename} - file not found`);
    return;
  }

  let content = fs.readFileSync(filepath, "utf8");

  // Apply replacements
  replacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });

  // Write back
  fs.writeFileSync(filepath, content);
  console.log(`Processed ${filename}`);
});

console.log("Done!");
