#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiDir = path.join(__dirname, "../content/reference/api");

function convertMdToMdx(dir: string): void {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      convertMdToMdx(filePath);
    } else if (file.endsWith(".md") && !file.endsWith(".mdx")) {
      const newPath = filePath.replace(/\.md$/, ".mdx");
      fs.renameSync(filePath, newPath);
      console.log(`Converted: ${filePath} -> ${newPath}`);
    }
  });
}

console.log("Converting TypeDoc .md files to .mdx...");
if (fs.existsSync(apiDir)) {
  convertMdToMdx(apiDir);
}
console.log("Conversion complete!");
