#!/usr/bin/env tsx

/**
 * Generate _meta.js files for TypeDoc API documentation with user-friendly names.
 * This script creates navigation metadata that makes the sidebar show clean names
 * like "Collections" instead of technical paths like "lib/collections".
 *
 * @module
 */

import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_DIR = path.join(__dirname, "../content/reference/api");

/**
 * Convert a file/directory name to a user-friendly title
 * Examples:
 * - "catalogs" -> "Catalogs"
 * - "import-jobs" -> "Import Jobs"
 * - "use-events-queries" -> "Use Events Queries"
 * - "dataset-schemas" -> "Dataset Schemas"
 * - "app" -> "API Routes"
 * - "lib" -> "Library"
 */
const toTitle = (name: string, parentPath?: string): string => {
  // Remove file extensions
  const baseName = name.replace(/\.(mdx?|ts|tsx|js|jsx)$/, "");

  // Handle special top-level cases for better naming
  const topLevelCases: Record<string, string> = {
    app: "API Routes",
    lib: "Library",
  };

  // If this is a top-level directory in the API folder, use custom naming
  if (parentPath && path.basename(parentPath) === "api" && topLevelCases[baseName]) {
    return topLevelCases[baseName];
  }

  // Handle special cases for acronyms and abbreviations
  const specialCases: Record<string, string> = {
    api: "API",
    url: "URL",
    id: "ID",
    csv: "CSV",
    json: "JSON",
    http: "HTTP",
    jwt: "JWT",
    oauth: "OAuth",
  };

  // Split on hyphens and slashes
  const words = baseName.split(/[-/]/);

  // Capitalize each word, handling special cases
  const titleWords = words.map((word) => {
    const lower = word.toLowerCase();
    if (specialCases[lower]) {
      return specialCases[lower];
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  return titleWords.join(" ");
};

/**
 * Get all items (files and directories) in a directory, excluding _meta files and index files
 */
const getDirectoryItems = (dir: string): { files: string[]; dirs: string[] } => {
  if (!fs.existsSync(dir)) {
    return { files: [], dirs: [] };
  }

  const items = fs.readdirSync(dir);
  const files: string[] = [];
  const dirs: string[] = [];
  const dirNames = new Set<string>();

  // First pass: collect directory names (excluding empty directories)
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith("_meta") && !item.startsWith(".")) {
      // Check if directory is not empty (has files other than _meta)
      const dirItems = fs.readdirSync(fullPath);
      const hasContent = dirItems.some((subItem) => !subItem.startsWith("_meta") && !subItem.startsWith("."));

      if (hasContent) {
        dirs.push(item);
        dirNames.add(item);
      }
    }
  }

  // Second pass: collect file names, excluding those that have a corresponding directory
  for (const item of items) {
    // Skip _meta files, index files, and route files (Next.js API routes)
    if (
      item.startsWith("_meta") ||
      item === "index.mdx" ||
      item === "index.md" ||
      item === "route.mdx" ||
      item === "route.md"
    ) {
      continue;
    }

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (!stat.isDirectory() && (item.endsWith(".mdx") || item.endsWith(".md"))) {
      // Remove extension for the key
      const key = item.replace(/\.mdx?$/, "");

      // Only add if there's no directory with the same name
      if (!dirNames.has(key)) {
        files.push(key);
      }
    }
  }

  return { files, dirs };
};

/**
 * Generate _meta.js content from items
 */
const generateMetaContent = (items: string[], dirPath: string): string => {
  const entries = items.map((item) => {
    const title = toTitle(item, dirPath);
    return `  "${item}": "${title}",`;
  });

  return `export default {\n${entries.join("\n")}\n};\n`;
};

/**
 * Generate _meta.js file for a directory
 */
const generateMetaFile = (dir: string): void => {
  const { files, dirs } = getDirectoryItems(dir);

  // Combine directories first, then files (directories appear first in sidebar)
  const allItems = [...dirs, ...files];

  if (allItems.length === 0) {
    return;
  }

  const metaPath = path.join(dir, "_meta.js");
  const content = generateMetaContent(allItems, dir);

  fs.writeFileSync(metaPath, content);
  console.log(`Generated: ${path.relative(API_DIR, metaPath)}`);
};

/**
 * Recursively generate _meta.js files for all directories
 */
const generateAllMetaFiles = (dir: string, maxDepth = 3, currentDepth = 0): void => {
  if (currentDepth >= maxDepth || !fs.existsSync(dir)) {
    return;
  }

  // Generate _meta.js for this directory
  generateMetaFile(dir);

  // Recurse into subdirectories
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith("_") && !item.startsWith(".")) {
      generateAllMetaFiles(fullPath, maxDepth, currentDepth + 1);
    }
  }
};

/**
 * Main function
 */
const main = (): void => {
  console.log("Generating _meta.js files for API documentation...\n");

  // Generate _meta.js files recursively, starting from the API directory
  // Set depth to 10 to handle all nested structures in the API documentation
  generateAllMetaFiles(API_DIR, 10);

  console.log("\n✓ _meta.js files generated successfully!");
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateAllMetaFiles, generateMetaFile, toTitle };
