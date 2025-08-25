#!/usr/bin/env tsx

/**
 * Convert Markdown files to MDX format.
 * Recursively processes all .md files in the API documentation directory.
 *
 * @module
 */

import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiDir = path.join(__dirname, "../content/reference/api");

const convertMdToMdx = (dir: string): number => {
  let convertedCount = 0;
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      convertedCount += convertMdToMdx(filePath);
    } else if (file.endsWith(".md") && !file.endsWith(".mdx")) {
      const newPath = filePath.replace(/\.md$/, ".mdx");
      fs.renameSync(filePath, newPath);
      console.log(`Converted: ${path.relative(apiDir, filePath)} -> ${path.basename(newPath)}`);
      convertedCount++;
    }
  });

  return convertedCount;
};

const main = (): void => {
  console.log("Converting TypeDoc .md files to .mdx...");

  if (!fs.existsSync(apiDir)) {
    console.log(`API directory not found: ${apiDir}`);
    process.exit(1);
  }

  const count = convertMdToMdx(apiDir);

  if (count > 0) {
    console.log(`\n✓ Converted ${count} file${count === 1 ? "" : "s"} to .mdx format`);
  } else {
    console.log("No .md files found to convert");
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { convertMdToMdx };
