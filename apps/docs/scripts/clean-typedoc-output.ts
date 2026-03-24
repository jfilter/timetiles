#!/usr/bin/env tsx

/**
 * Post-process TypeDoc output to make it compatible with Nextra v4.
 * - Removes directories with brackets in names
 * - Converts .md to .mdx
 * - Cleans up invalid references in generated files
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
 * Recursively find all directories containing brackets
 */
const findBracketDirectories = (dir: string, result: string[] = []): string[] => {
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
};

/**
 * Remove empty directories recursively
 */
const removeEmptyDirectories = (dir: string): void => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);

  // First recursively process subdirectories
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      removeEmptyDirectories(fullPath);
    }
  }

  // Now check if this directory is empty (or only contains hidden files)
  const remainingItems = fs.readdirSync(dir);
  const hasContent = remainingItems.some((item) => !item.startsWith("."));

  if (!hasContent && dir !== API_DIR) {
    // Don't remove the API_DIR itself
    console.log(`Removing empty directory: ${path.relative(API_DIR, dir)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * Remove directories with brackets in their names
 */
const removeBracketDirectories = (): void => {
  const dirsToRemove = findBracketDirectories(API_DIR);

  for (const dir of dirsToRemove) {
    console.log(`Removing problematic directory: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (dirsToRemove.length > 0) {
    console.log(`Removed ${dirsToRemove.length} directories with brackets`);
  }

  // After removing bracket directories, clean up any empty parent directories
  console.log("Removing empty directories...");
  removeEmptyDirectories(API_DIR);
};

/**
 * Convert all .md files to .mdx and handle README files
 */
const convertMdToMdx = (dir: string): void => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      convertMdToMdx(fullPath);
    } else if (item.endsWith(".md") && !item.endsWith(".mdx")) {
      let newPath = fullPath.replace(/\.md$/, ".mdx");

      // Convert README.md to index.mdx for Nextra compatibility
      if (item === "README.md") {
        newPath = path.join(path.dirname(fullPath), "index.mdx");
      }

      fs.renameSync(fullPath, newPath);
      console.log(`Converted: ${path.relative(API_DIR, fullPath)} -> ${path.basename(newPath)}`);
    }
  }

  // Handle case where a .mdx file exists alongside a directory with same name
  // Move the .mdx file into the directory as index.mdx
  for (const item of items) {
    if (item.endsWith(".mdx")) {
      const baseName = item.replace(/\.mdx$/, "");
      const dirPath = path.join(dir, baseName);
      const filePath = path.join(dir, item);

      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const indexPath = path.join(dirPath, "index.mdx");
        if (!fs.existsSync(indexPath)) {
          fs.renameSync(filePath, indexPath);
          console.log(`Moved ${item} into ${baseName}/index.mdx for Nextra compatibility`);
        }
      }
    }
  }
};

/**
 * Next.js reserved filenames that cannot be used as MDX content pages.
 * These are treated specially by Next.js/SWC even outside the `app/` directory,
 * causing build errors when Nextra adds `export const metadata` to them.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions
 */
const NEXTJS_RESERVED_FILENAMES = new Set([
  "route",
  "page",
  "layout",
  "loading",
  "error",
  "template",
  "not-found",
  "default",
  "middleware",
]);

/**
 * Rename Next.js reserved filenames to index.mdx to avoid build conflicts.
 * For example, TypeDoc generates `route.mdx` from API route handlers, but
 * Next.js treats `route.*` as an API route definition and forbids metadata exports.
 */
const renameReservedFilenames = (dir: string): void => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      renameReservedFilenames(fullPath);
    } else if (item.endsWith(".mdx")) {
      const baseName = item.replace(/\.mdx$/, "");
      if (NEXTJS_RESERVED_FILENAMES.has(baseName)) {
        const indexPath = path.join(dir, "index.mdx");
        if (!fs.existsSync(indexPath)) {
          fs.renameSync(fullPath, indexPath);
          console.log(`Renamed reserved file: ${path.relative(API_DIR, fullPath)} -> index.mdx`);
        } else {
          // index.mdx already exists — remove the conflicting file
          fs.rmSync(fullPath);
          console.log(`Removed conflicting reserved file: ${path.relative(API_DIR, fullPath)}`);
        }
      }
    }
  }
};

/**
 * Clean up invalid references in a file
 */
const cleanupFileContent = (filePath: string): void => {
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  // Remove references to files/directories with brackets
  const bracketPattern = /\[([^\]]+)\]\(([^)[\]]*[[\]][^)]*)\)/g;
  if (bracketPattern.test(content)) {
    content = content.replace(bracketPattern, (match, text, url) => {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- boolean OR is intentional
      if (url.includes("[") || url.includes("]")) {
        console.log(`  Removing invalid reference in ${path.basename(filePath)}: ${url}`);
        return text; // Just keep the text, remove the link
      }
      return match;
    });
    modified = true;
  }

  // Remove links to undefined references
  const undefinedPattern = /\[([^\]]+)\]\(undefined\)/g;
  if (undefinedPattern.test(content)) {
    content = content.replace(undefinedPattern, "$1");
    modified = true;
  }

  // Fix broken TypeDoc member references
  const memberPattern = /\[([^\]]+)\]\(([^)#]+)#[^)]*%5B[^)]*%5D[^)]*\)/g;
  if (memberPattern.test(content)) {
    content = content.replace(memberPattern, (match, text, baseUrl) => {
      console.log(`  Fixing member reference in ${path.basename(filePath)}`);
      return `[${text}](${baseUrl})`;
    });
    modified = true;
  }

  // Remove completely broken references with encoded brackets
  const encodedBracketPattern = /\[([^\]]+)\]\([^)]*%5B[^)]*%5D[^)]*\)/g;
  if (encodedBracketPattern.test(content)) {
    content = content.replace(encodedBracketPattern, "$1");
    modified = true;
  }

  // Fix *** horizontal rules to --- (prettier prefers ---)
  if (content.includes("***")) {
    content = content.replace(/^\*\*\*$/gm, "---");
    modified = true;
  }

  // Convert escaped object types to code blocks to prevent MDX parsing issues
  // Pattern: \{ `key`: `type`; ... \} -> `{ key: type; ... }`
  if (content.includes("\\{") && content.includes("\\}")) {
    content = content.replace(/\\{([^}]+)\\}/g, (match, inner) => {
      // Remove backticks around keys/types and create a proper code span
      const cleaned = inner.replace(/`([^`]+)`/g, "$1").trim();
      return "`{ " + cleaned + " }`";
    });
    modified = true;
  }

  // Escape bare { and } outside code spans/blocks to prevent MDX JSX interpretation.
  // MDX treats { } as JSX expression delimiters, causing acorn parse errors for
  // object literals, template placeholders, and nested backtick edge cases.
  const lines = content.split("\n");
  let inCodeBlock = false;
  const escapedLines = lines.map((line) => {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock || line.startsWith("    ")) return line;

    // Split by backtick code spans — odd indices are inside backticks
    const parts = line.split(/(`[^`]*`)/);
    const escapedParts = parts.map((part, i) => {
      if (i % 2 === 1) return part; // inside backticks, leave alone

      // Escape bare { } (not already escaped with backslash)
      let escaped = part.replace(/(?<!\\)\{/g, "\\{").replace(/(?<!\\)\}/g, "\\}");

      // Escape <= and >= (MDX interprets as JSX)
      escaped = escaped.replace(/<=/g, "&lt;=").replace(/>=/g, "&gt;=");

      if (escaped !== part) modified = true;
      return escaped;
    });
    return escapedParts.join("");
  });

  if (modified) {
    fs.writeFileSync(filePath, escapedLines.join("\n"));
  }
};

/**
 * Clean up all .mdx files
 */
const cleanupAllFiles = (dir: string): void => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      cleanupAllFiles(fullPath);
    } else if (item.endsWith(".mdx") || item.endsWith(".md")) {
      cleanupFileContent(fullPath);
    }
  }
};

/**
 * Test whether a line is a continuation of a function signature.
 * Returns false for lines that start a new block or are blank.
 */
const isSignatureContinuation = (line: string | undefined): line is string => {
  if (!line) return false;
  return !/(?:^[▸#*-])|(?:\s*$)/.test(line);
};

/**
 * Collect continuation lines of a multi-line function signature starting at
 * index {@link startIndex} (the line after the `▸` prefix line).
 * Returns the number of continuation lines consumed.
 */
const collectSignatureContinuation = (
  lines: string[],
  startIndex: number,
  currentSignature: string
): { merged: string; linesConsumed: number } => {
  let merged = currentSignature;
  let j = startIndex;
  while (j < lines.length && isSignatureContinuation(lines[j])) {
    merged += " " + (lines[j]?.trim() || "");
    j++;
  }
  return { merged, linesConsumed: j - startIndex };
};

/**
 * Process the lines of a single file, merging multi-line function signatures
 * into single lines. Returns null if no changes were made.
 */
const mergeMultiLineSignatures = (content: string, fileName: string): string | null => {
  const lines = content.split("\n");
  const fixedLines: string[] = [];
  let inCodeBlock = false;
  let modified = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Track code blocks to avoid modifying code
    if (line?.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && line && /^▸\s+/.exec(line)) {
      // Start of a function signature — check if it continues
      const { merged, linesConsumed } = collectSignatureContinuation(lines, i + 1, line);

      if (linesConsumed > 0) {
        console.log(`  Fixing multi-line signature in ${fileName}`);
        fixedLines.push(merged);
        i += 1 + linesConsumed; // skip the starting line + continuations
        modified = true;
        continue;
      }

      fixedLines.push(line);
    } else if (line != null) {
      fixedLines.push(line);
    }

    i++;
  }

  return modified ? fixedLines.join("\n") : null;
};

/**
 * Fix function signatures that span multiple lines
 */
const fixFunctionSignatures = (dir: string): void => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      fixFunctionSignatures(fullPath);
      continue;
    }

    if (!item.endsWith(".mdx") && !item.endsWith(".md")) continue;

    const content = fs.readFileSync(fullPath, "utf-8");
    const result = mergeMultiLineSignatures(content, path.basename(fullPath));
    if (result != null) {
      fs.writeFileSync(fullPath, result);
    }
  }
};

/**
 * Main function
 */
const main = (): void => {
  console.log("Cleaning TypeDoc output...\n");

  // Step 1: Remove directories with brackets
  console.log("Step 1: Removing directories with brackets...");
  removeBracketDirectories();

  // Step 2: Convert .md to .mdx
  console.log("\nStep 2: Converting .md files to .mdx...");
  convertMdToMdx(API_DIR);

  // Step 3: Rename Next.js reserved filenames (e.g. route.mdx -> index.mdx)
  console.log("\nStep 3: Renaming Next.js reserved filenames...");
  renameReservedFilenames(API_DIR);

  // Step 4: Clean up file contents
  console.log("\nStep 4: Cleaning up invalid references...");
  cleanupAllFiles(API_DIR);

  // Step 5: Fix multi-line function signatures
  console.log("\nStep 5: Fixing function signatures...");
  fixFunctionSignatures(API_DIR);

  console.log("\n✓ TypeDoc output cleaned successfully!");
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  cleanupAllFiles,
  convertMdToMdx,
  fixFunctionSignatures,
  removeBracketDirectories,
  removeEmptyDirectories,
  renameReservedFilenames,
};
