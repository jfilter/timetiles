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
  const memberPattern = /\[([^\]]+)\]\(([^)]+)#[^)]*%5B[^)]*%5D[^)]*\)/g;
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

  // Escape <= and >= symbols in MDX content (outside code blocks)
  // These can cause MDX parsing errors when interpreted as JSX
  const lines = content.split("\n");
  const escapedLines = lines.map((line) => {
    // Skip code blocks and code spans
    if (line.startsWith("```") || line.startsWith("    ") || line.match(/^>\s*`/)) {
      return line;
    }
    // Don't escape inside backticks
    if (line.includes("`")) {
      return line;
    }
    // Escape <= and >= outside of code
    if (line.includes("<=") || line.includes(">=")) {
      const escapedLine = line.replace(/<=(?![^<]*`)/g, "&lt;=").replace(/>=(?![^>]*`)/g, "&gt;=");
      if (escapedLine !== line) {
        modified = true;
      }
      return escapedLine;
    }
    return line;
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
 * Fix function signatures that span multiple lines
 */
// eslint-disable-next-line complexity
const fixFunctionSignatures = (dir: string): void => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      fixFunctionSignatures(fullPath);
    } else if (item.endsWith(".mdx") || item.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      let modified = false;

      // Fix function signatures split across lines
      const lines = content.split("\n");
      const fixedLines: string[] = [];
      let inCodeBlock = false;
      let currentSignature = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Track code blocks to avoid modifying code
        if (line?.startsWith("```")) {
          inCodeBlock = !inCodeBlock;
        }

        if (!inCodeBlock && line && /^▸\s+/.exec(line)) {
          // Start of a function signature
          currentSignature = line;

          // Check if signature continues on next lines
          let j = i + 1;
          while (j < lines.length && lines[j] && !/^[▸#*-]|\s*$/.test(lines[j] ?? "")) {
            currentSignature += " " + (lines[j]?.trim() || "");
            j++;
          }

          if (j > i + 1) {
            // Multi-line signature found
            console.log(`  Fixing multi-line signature in ${path.basename(fullPath)}`);
            fixedLines.push(currentSignature);
            i = j - 1; // Skip the lines we've already processed
            modified = true;
          } else {
            fixedLines.push(line);
          }
        } else {
          if (line != null) {
            fixedLines.push(line);
          }
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, fixedLines.join("\n"));
      }
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

  // Step 3: Clean up file contents
  console.log("\nStep 3: Cleaning up invalid references...");
  cleanupAllFiles(API_DIR);

  // Step 4: Fix multi-line function signatures
  console.log("\nStep 4: Fixing function signatures...");
  fixFunctionSignatures(API_DIR);

  console.log("\n✓ TypeDoc output cleaned successfully!");
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { cleanupAllFiles, convertMdToMdx, fixFunctionSignatures, removeBracketDirectories };
