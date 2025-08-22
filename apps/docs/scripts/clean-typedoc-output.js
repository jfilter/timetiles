#!/usr/bin/env node

/**
 * Post-process TypeDoc output to make it compatible with Nextra v4
 * - Removes directories with brackets in names
 * - Converts .md to .mdx
 * - Cleans up invalid references in generated files
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_DIR = path.join(__dirname, "../content/reference/api");

/**
 * Recursively find all directories containing brackets
 */
function findBracketDirectories(dir, result = []) {
  if (!fs.existsSync(dir)) return result;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (item.includes("[") || item.includes("]")) {
        result.push(fullPath);
      }
      findBracketDirectories(fullPath, result);
    }
  }

  return result;
}

/**
 * Remove directories with brackets in their names
 */
function removeBracketDirectories() {
  const dirsToRemove = findBracketDirectories(API_DIR);

  for (const dir of dirsToRemove) {
    console.log(`Removing problematic directory: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return dirsToRemove.length;
}

/**
 * Convert all .md files to .mdx
 */
function convertMdToMdx(dir) {
  if (!fs.existsSync(dir)) return 0;

  let count = 0;
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      count += convertMdToMdx(fullPath);
    } else if (item.endsWith(".md") && !item.endsWith(".mdx")) {
      const newPath = fullPath.replace(/\.md$/, ".mdx");
      fs.renameSync(fullPath, newPath);
      count++;
    }
  }

  return count;
}

/**
 * Convert file path to readable title
 */
function pathToTitle(filePath) {
  // Remove common prefixes
  const cleaned = filePath
    .replace(/^lib\//, "")
    .replace(/^app\/api\//, "")
    .replace(/\/route$/, "");

  // Split path into parts
  const parts = cleaned.split("/");

  // For lib/collections/*, lib/services/*, etc., just use the last part
  // since the parent directory is already shown in the navigation hierarchy
  if (
    parts.length >= 2 &&
    ["collections", "services", "jobs", "hooks", "utils", "types", "constants", "globals"].includes(parts[0])
  ) {
    // Skip the first part (e.g., 'collections') and join the rest
    const relevantParts = parts.slice(1);

    return relevantParts
      .map((part) => {
        // Handle special cases
        const specialCases = {
          api: "API",
          url: "URL",
          id: "ID",
          jwt: "JWT",
          oauth: "OAuth",
        };

        // Convert kebab-case to Title Case
        return part
          .split("-")
          .map((word) => {
            const lower = word.toLowerCase();
            if (specialCases[lower]) {
              return specialCases[lower];
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
          })
          .join(" ");
      })
      .join(" / ");
  }

  // For other paths, keep the full path
  return parts
    .map((part) => {
      // Handle special cases
      const specialCases = {
        api: "API",
        url: "URL",
        id: "ID",
        jwt: "JWT",
        oauth: "OAuth",
      };

      // Convert kebab-case to Title Case
      return part
        .split("-")
        .map((word) => {
          const lower = word.toLowerCase();
          if (specialCases[lower]) {
            return specialCases[lower];
          }
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
    })
    .join(" / ");
}

/**
 * Clean up references to bracket directories in MDX files
 */
function cleanupReferences(dir) {
  if (!fs.existsSync(dir)) return 0;

  let count = 0;
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      count += cleanupReferences(fullPath);
    } else if (item.endsWith(".mdx")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      let modified = false;

      // Remove links to files with brackets
      const bracketLinkPattern = /\[([^\]]+)\]\([^)]*\\\[[^\]]*\\\][^)]*\)/g;
      if (bracketLinkPattern.test(content)) {
        content = content.replace(bracketLinkPattern, (match, linkText) => {
          console.log(`Removing broken link: ${match}`);
          return linkText; // Keep the text, remove the link
        });
        modified = true;
      }

      // Remove references to [importId] and [token] routes
      const patterns = [
        /\*\s*\[([^\]]+)\]\([^)]*\[importId\][^)]*\)/g,
        /\*\s*\[([^\]]+)\]\([^)]*\[token\][^)]*\)/g,
        /^.*\\\[importId\\\].*$/gm,
        /^.*\\\[token\\\].*$/gm,
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          content = content.replace(pattern, "");
          modified = true;
        }
      }

      // Clean up empty list items
      content = content.replace(/^\*\s*$/gm, "");

      // Clean up multiple empty lines
      content = content.replace(/\n{3,}/g, "\n\n");

      // Fix h1 headings to be more readable
      const h1Match = content.match(/^# (lib\/[^\n]+|app\/api\/[^\n]+)/m);
      if (h1Match) {
        const oldHeading = h1Match[1];
        const newHeading = pathToTitle(oldHeading);
        content = content.replace(`# ${oldHeading}`, `# ${newHeading}`);
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(fullPath, content, "utf-8");
        count++;
      }
    }
  }

  return count;
}

/**
 * Fix the main index file if it exists
 */
function fixIndexFile() {
  const indexPath = path.join(API_DIR, "index.mdx");

  if (!fs.existsSync(indexPath)) {
    // Create a simple index if it doesn't exist
    const content = `# API Reference

Welcome to the TimeTiles API documentation.

## Modules

Browse the documentation using the sidebar navigation.

### Core APIs

- **Collections** - Payload CMS collection definitions
- **Services** - Business logic and data processing
- **Jobs** - Background job handlers
- **Hooks** - React Query hooks for data fetching
- **Utils** - Utility functions and helpers

### API Routes

- **Events** - Event data endpoints
- **Import** - File import and processing
- **Health** - System health checks
`;

    fs.writeFileSync(indexPath, content, "utf-8");
    console.log("Created new index.mdx");
    return true;
  }

  return false;
}

// Main execution
console.log("Cleaning TypeDoc output for Nextra v4 compatibility...\n");

// Step 1: Remove problematic directories
const removedDirs = removeBracketDirectories();
console.log(`✓ Removed ${removedDirs} directories with brackets\n`);

// Step 2: Convert .md to .mdx
const convertedFiles = convertMdToMdx(API_DIR);
console.log(`✓ Converted ${convertedFiles} files from .md to .mdx\n`);

// Step 3: Clean up references
const cleanedFiles = cleanupReferences(API_DIR);
console.log(`✓ Cleaned up references in ${cleanedFiles} files\n`);

// Step 4: Fix index file
const indexFixed = fixIndexFile();
if (indexFixed) {
  console.log("✓ Fixed or created index.mdx\n");
}

// Step 5: Remove duplicate README.mdx if it exists (we use index.mdx instead)
const readmePath = path.join(API_DIR, "README.mdx");
if (fs.existsSync(readmePath)) {
  fs.unlinkSync(readmePath);
  console.log("✓ Removed duplicate README.mdx file\n");
}

console.log("TypeDoc output cleaning complete!\n");

// Step 6: Generate _meta.json files for navigation
console.log("Generating navigation metadata...");
import("./generate-meta-files.js")
  .then(() => {
    console.log("✓ Navigation metadata generated\n");
  })
  .catch((err) => {
    console.error("Failed to generate navigation metadata:", err);
  });
