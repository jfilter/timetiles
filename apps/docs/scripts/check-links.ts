#!/usr/bin/env tsx

/**
 * Check for broken links in documentation files.
 * Validates both internal and external links in MDX/MD files.
 *
 * @module
 */

import fs from "fs";
import { glob } from "glob";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const docsDir = path.join(__dirname, "../content");

// Regular expressions to match different link types
const linkPatterns = [
  // Markdown links: [text](url)
  /\[([^\]]+)\]\(([^)]+)\)/g,
  // MDX imports
  /import(?:\s+(?:\S.*)\s+|\s{2,})from\s+['"]([^'"]+)['"]/g,
  // Next.js Link component href
  /href=["']([^"']+)["']/g,
  // Direct URL references in text
  /https?:\/\/[^\s<>)"']+/g,
];

// Patterns to ignore
const ignorePatterns = [
  /^#/, // Anchor links
  /^mailto:/, // Email links
  /^javascript:/, // JavaScript links
  /localhost/, // Local development URLs
  /127\.0\.0\.1/, // Local IPs
  /example\.com/, // Example domains
  /\$\{/, // Template variables
];

interface LinkCheckResult {
  valid: boolean;
  resolved: string;
}

interface LinkInfo {
  url: string;
  file: string;
  line: number;
  valid?: boolean;
  error?: string;
}

const findAllMdxFiles = async (): Promise<string[]> => {
  const pattern = path.join(docsDir, "**/*.{md,mdx}");
  return glob(pattern, {
    ignore: [
      "**/reference/api/**/*.md",
      "**/reference/api/**/*.mdx",
      "!**/reference/api/_meta.json",
      "!**/reference/api/index.mdx",
    ],
  });
};

const extractLinks = (content: string, _filePath: string): string[] => {
  const links = new Set<string>();

  // Remove code blocks (both fenced and inline) to avoid checking example code
  let contentWithoutCode = content
    // Remove fenced code blocks (```...```)
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code (`...`)
    .replace(/`[^`\n]+`/g, "");

  linkPatterns.forEach((pattern) => {
    const matches = contentWithoutCode.matchAll(pattern);
    for (const match of matches) {
      // Get the URL from the match (position varies by pattern)
      const url = match[2] || match[1];
      if (url && !ignorePatterns.some((ignore) => ignore.test(url))) {
        links.add(url);
      }
    }
  });

  return Array.from(links);
};

const resolveInternalLink = (link: string, currentFile: string): LinkCheckResult | null => {
  // Handle relative paths
  if (link.startsWith("./") || link.startsWith("../")) {
    const dir = path.dirname(currentFile);
    let resolved = path.resolve(dir, link);

    // Remove fragment identifier
    resolved = resolved.split("#")[0] || resolved;

    // Check if file exists with various extensions
    const extensions = ["", ".mdx", ".md", "/index.mdx", "/index.md"];
    for (const ext of extensions) {
      const testPath = resolved + ext;
      if (fs.existsSync(testPath)) {
        return { valid: true, resolved: testPath };
      }
    }

    return { valid: false, resolved };
  }

  // Handle absolute paths from docs root
  if (link.startsWith("/")) {
    const resolved = path.join(docsDir, link);
    const extensions = ["", ".mdx", ".md", "/index.mdx", "/index.md"];

    for (const ext of extensions) {
      const testPath = resolved.split("#")[0] + ext;
      if (fs.existsSync(testPath)) {
        return { valid: true, resolved: testPath };
      }
    }

    return { valid: false, resolved };
  }

  return null; // External link
};

const checkExternalLink = async (url: string): Promise<{ valid: boolean; error?: string }> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkChecker/1.0)",
      },
    });

    clearTimeout(timeout);
    return { valid: response.ok };
  } catch {
    // Try GET if HEAD fails
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LinkChecker/1.0)",
        },
      });

      clearTimeout(timeout);
      return { valid: response.ok };
    } catch (getError: unknown) {
      const errorMessage = getError instanceof Error ? getError.message : String(getError);
      return { valid: false, error: errorMessage };
    }
  }
};

const main = async (): Promise<void> => {
  console.log("Checking links in documentation...\n");

  const files = await findAllMdxFiles();
  const allLinks: LinkInfo[] = [];
  const brokenLinks: LinkInfo[] = [];
  const externalLinks: LinkInfo[] = [];

  // Extract all links from files
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const links = extractLinks(content, file);
    const lines = content.split("\n");

    for (const link of links) {
      // Find line number
      let lineNumber = 1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes(link)) {
          lineNumber = i + 1;
          break;
        }
      }

      const linkInfo: LinkInfo = {
        url: link,
        file: path.relative(docsDir, file),
        line: lineNumber,
      };

      // Check if internal or external
      const internalCheck = resolveInternalLink(link, file);

      if (internalCheck !== null) {
        // Internal link
        linkInfo.valid = internalCheck.valid;
        if (!internalCheck.valid) {
          brokenLinks.push(linkInfo);
        }
      } else if (link.startsWith("http://") || link.startsWith("https://")) {
        // External link - check later
        externalLinks.push(linkInfo);
      }

      allLinks.push(linkInfo);
    }
  }

  // Check external links (with rate limiting)
  if (externalLinks.length > 0 && !process.env.SKIP_EXTERNAL) {
    console.log(`Checking ${externalLinks.length} external links...`);

    for (const linkInfo of externalLinks) {
      const result = await checkExternalLink(linkInfo.url);
      linkInfo.valid = result.valid;
      if (!result.valid) {
        linkInfo.error = result.error;
        brokenLinks.push(linkInfo);
      }
      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Report results
  console.log("\n" + "=".repeat(60));
  console.log("Link Check Results");
  console.log("=".repeat(60));

  console.log(`\nTotal links found: ${allLinks.length}`);

  if (brokenLinks.length === 0) {
    console.log("✓ All links are valid!");
  } else {
    console.log(`\n✗ Found ${brokenLinks.length} broken links:\n`);

    for (const link of brokenLinks) {
      console.log(`  ${link.file}:${link.line}`);
      console.log(`    ${link.url}`);
      if (link.error) {
        console.log(`    Error: ${link.error}`);
      }
    }

    process.exit(1);
  }

  console.log("\nTip: Set SKIP_EXTERNAL=1 to skip external link checking");
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

export { checkExternalLink, extractLinks, findAllMdxFiles, resolveInternalLink };
