#!/usr/bin/env node
/**
 * CLI entry point for `timescrape init` — scaffolds a new scraper project.
 *
 * @module
 * @category CLI
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gitignoreTemplate } from "./templates/gitignore.js";
import { manifestTemplate } from "./templates/manifest.js";
import { nodeScraperTemplate } from "./templates/node-scraper.js";
import { pythonScraperTemplate } from "./templates/python-scraper.js";
import { readmeTemplate } from "./templates/readme.js";

const VALID_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_RUNTIMES = ["python", "node"] as const;
type Runtime = (typeof VALID_RUNTIMES)[number];

function printUsage(): void {
  console.log(`
Usage: timescrape init <name> [options]

Create a new TimeScrape scraper project.

Arguments:
  name                  Scraper name (lowercase alphanumeric with hyphens)

Options:
  --runtime <runtime>   Runtime environment: python or node (default: python)
  --help                Show this help message
`);
}

function parseArgs(argv: string[]): { name: string; runtime: Runtime } | null {
  // argv[0] = node, argv[1] = script, rest = user args
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return null;
  }

  const command = args[0];
  if (command !== "init") {
    console.error(`Unknown command: ${command}`);
    console.error('Run "timescrape --help" for usage.');
    process.exit(1);
  }

  const name = args[1];
  if (!name) {
    console.error("Error: scraper name is required.");
    console.error('Run "timescrape init --help" for usage.');
    process.exit(1);
  }

  if (!VALID_NAME_PATTERN.test(name)) {
    console.error(`Error: invalid name "${name}".`);
    console.error("Name must be lowercase alphanumeric with hyphens (e.g. my-scraper).");
    process.exit(1);
  }

  let runtime: Runtime = "python";
  const runtimeIndex = args.indexOf("--runtime");
  if (runtimeIndex !== -1) {
    const runtimeValue = args[runtimeIndex + 1];
    if (!runtimeValue || !VALID_RUNTIMES.includes(runtimeValue as Runtime)) {
      console.error(`Error: invalid runtime "${runtimeValue ?? ""}".`);
      console.error("Supported runtimes: python, node");
      process.exit(1);
    }
    runtime = runtimeValue as Runtime;
  }

  return { name, runtime };
}

function toTitleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function scaffoldProject(name: string, runtime: Runtime): void {
  const targetDir = join(process.cwd(), name);

  if (existsSync(targetDir)) {
    console.error(`Error: directory "${name}" already exists.`);
    process.exit(1);
  }

  const displayName = toTitleCase(name);
  const entrypoint = runtime === "python" ? "scraper.py" : "scraper.js";

  const files: Array<{ path: string; content: string }> = [
    { path: "scrapers.yml", content: manifestTemplate({ name: displayName, slug: name, runtime, entrypoint }) },
    {
      path: entrypoint,
      content:
        runtime === "python"
          ? pythonScraperTemplate({ name: displayName })
          : nodeScraperTemplate({ name: displayName }),
    },
    { path: ".gitignore", content: gitignoreTemplate },
    { path: "README.md", content: readmeTemplate({ name: displayName, runtime, entrypoint }) },
  ];

  mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    writeFileSync(join(targetDir, file.path), file.content);
  }

  console.log(`Created scraper project in ./${name}/`);
  console.log();
  console.log("Files:");
  for (const file of files) {
    console.log(`  ${name}/${file.path}`);
  }
  console.log();
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log(`  # Edit ${entrypoint} with your scraping logic`);
  console.log("  # Push to a git repository and add it in TimeTiles");
}

// --- Main ---

const parsed = parseArgs(process.argv);
if (parsed) {
  scaffoldProject(parsed.name, parsed.runtime);
}
