#!/usr/bin/env node

/**
 * Converts TypeDoc-generated .md files to .mdx files for Nextra v4 compatibility
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function convertMdToMdx(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively process subdirectories
      convertMdToMdx(filePath);
    } else if (file.endsWith(".md")) {
      // Rename .md to .mdx
      const newPath = filePath.replace(/\.md$/, ".mdx");
      fs.renameSync(filePath, newPath);
      console.log(`Converted: ${filePath} → ${newPath}`);
    }
  });
}

const apiDir = path.join(__dirname, "../content/reference/api");

if (fs.existsSync(apiDir)) {
  console.log("Converting TypeDoc .md files to .mdx...");
  convertMdToMdx(apiDir);
  console.log("Conversion complete!");
} else {
  console.error("API documentation directory not found:", apiDir);
  process.exit(1);
}
