/**
 * Review and bulk-resolve SonarCloud Security Hotspots via API.
 *
 * Groups hotspots by category and lets you mark them as SAFE or skip.
 * Run with: pnpm hotspots:review
 *
 * @module
 * @category Scripts
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

interface SonarCloudHotspot {
  key: string;
  component: string;
  securityCategory: string;
  vulnerabilityProbability: string;
  status: string;
  line?: number;
  message: string;
}

interface GroupedHotspots {
  category: string;
  probability: string;
  hotspots: SonarCloudHotspot[];
  files: Map<string, SonarCloudHotspot[]>;
}

function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      if (line.trim() && !line.startsWith("#")) {
        const eqIndex = line.indexOf("=");
        if (eqIndex > 0) {
          const key = line.slice(0, eqIndex).trim();
          const value = line.slice(eqIndex + 1).trim();
          process.env[key] = value;
        }
      }
    });
  }
}

function stripProjectKey(component: string): string {
  const colonIndex = component.indexOf(":");
  return colonIndex >= 0 ? component.slice(colonIndex + 1) : component;
}

function groupHotspots(hotspots: SonarCloudHotspot[]): GroupedHotspots[] {
  const groups = new Map<string, GroupedHotspots>();

  for (const h of hotspots) {
    const key = h.securityCategory;
    if (!groups.has(key)) {
      groups.set(key, {
        category: h.securityCategory,
        probability: h.vulnerabilityProbability,
        hotspots: [],
        files: new Map(),
      });
    }
    const group = groups.get(key)!;
    group.hotspots.push(h);

    const filePath = stripProjectKey(h.component);
    if (!group.files.has(filePath)) {
      group.files.set(filePath, []);
    }
    group.files.get(filePath)!.push(h);
  }

  // Sort by count descending
  return Array.from(groups.values()).sort((a, b) => b.hotspots.length - a.hotspots.length);
}

async function markHotspot(token: string, hotspotKey: string, status: string, resolution?: string): Promise<boolean> {
  const params = new URLSearchParams({ hotspot: hotspotKey, status });
  if (resolution) {
    params.set("resolution", resolution);
  }

  const response = await fetch("https://sonarcloud.io/api/hotspots/change_status", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(token + ":").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  return response.status === 204;
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim().toLowerCase()));
  });
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = process.argv.slice(2);
  const allSafe = args.includes("--all-safe");
  const dryRun = args.includes("--dry-run");
  const filterCategory = args.find((a) => a.startsWith("--category="))?.split("=")[1];

  const token = process.env.SONARCLOUD_TOKEN;
  const projectKey = process.env.SONARCLOUD_PROJECT_KEY;

  if (!token || !projectKey) {
    console.error("SONARCLOUD_TOKEN and SONARCLOUD_PROJECT_KEY must be set in .env.local");
    process.exit(1);
  }

  // Fetch current hotspots directly from API
  console.log("Fetching Security Hotspots from SonarCloud...");

  let allHotspots: SonarCloudHotspot[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;
  const headers = { Authorization: `Basic ${Buffer.from(token + ":").toString("base64")}` };

  while (page <= totalPages) {
    const url = `https://sonarcloud.io/api/hotspots/search?projectKey=${projectKey}&status=TO_REVIEW&ps=${pageSize}&p=${page}`;
    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = (await response.json()) as {
      paging: { total: number; pageIndex: number; pageSize: number };
      hotspots: SonarCloudHotspot[];
    };

    allHotspots = allHotspots.concat(data.hotspots);
    totalPages = Math.ceil(data.paging.total / data.paging.pageSize);
    page++;
  }

  if (allHotspots.length === 0) {
    console.log("\n✅ No Security Hotspots to review!");
    return;
  }

  let filteredHotspots = allHotspots;
  if (filterCategory) {
    filteredHotspots = allHotspots.filter((h) => h.securityCategory === filterCategory);
    if (filteredHotspots.length === 0) {
      console.log(`\nNo hotspots found for category "${filterCategory}"`);
      return;
    }
    console.log(`\nFiltered to category "${filterCategory}": ${filteredHotspots.length} hotspots`);
  }

  const groups = groupHotspots(filteredHotspots);

  console.log(`\nFound ${filteredHotspots.length} hotspots in ${groups.length} categories:\n`);
  groups.forEach((g, i) => {
    console.log(
      `  ${i + 1}. ${g.category} [${g.probability}] — ${g.hotspots.length} hotspots in ${g.files.size} files`
    );
  });

  let totalReviewed = 0;
  let totalSkipped = 0;

  // Non-interactive mode: --all-safe
  if (allSafe) {
    if (dryRun) {
      console.log(`\n[DRY RUN] Would mark ${filteredHotspots.length} hotspots as SAFE`);
      return;
    }

    console.log(`\nMarking all ${filteredHotspots.length} hotspots as SAFE...`);
    for (let i = 0; i < filteredHotspots.length; i++) {
      const h = filteredHotspots[i];
      const ok = await markHotspot(token, h.key, "REVIEWED", "SAFE");
      if (ok) {
        totalReviewed++;
      } else {
        console.log(`  ❌ Failed: ${stripProjectKey(h.component)}:${h.line}`);
      }
      process.stdout.write(`\r  Progress: ${i + 1}/${filteredHotspots.length}`);
    }
    console.log(`\n\n✅ Marked ${totalReviewed} hotspots as SAFE`);

    if (totalReviewed > 0) {
      console.log("Run 'pnpm sonarcloud:fetch' to verify updated status.");
    }
    return;
  }

  // Interactive mode
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  for (const group of groups) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Category: ${group.category} [${group.probability}]`);
    console.log(`${group.hotspots.length} hotspots in ${group.files.size} files:`);

    for (const [filePath, fileHotspots] of group.files) {
      console.log(`  ${filePath}`);
      for (const h of fileHotspots) {
        const line = h.line ? `:${h.line}` : "";
        console.log(`    L${line} ${h.message}`);
      }
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would prompt for review`);
      continue;
    }

    const answer = await ask(
      rl,
      `\nMark all ${group.hotspots.length} as SAFE? [y]es / [s]kip / [f]ile-by-file / [q]uit: `
    );

    if (answer === "q") {
      console.log("Quitting.");
      break;
    }

    if (answer === "y" || answer === "yes") {
      let count = 0;
      for (const h of group.hotspots) {
        const ok = await markHotspot(token, h.key, "REVIEWED", "SAFE");
        count++;
        if (ok) {
          totalReviewed++;
          process.stdout.write(`\r  Reviewed ${count}/${group.hotspots.length}`);
        } else {
          console.log(`\n  ❌ Failed to mark hotspot ${h.key}`);
        }
      }
      console.log(`\n  ✅ Marked ${count} hotspots as SAFE`);
    } else if (answer === "f" || answer === "file") {
      for (const [filePath, fileHotspots] of group.files) {
        const fileAnswer = await ask(rl, `  Mark ${fileHotspots.length} hotspot(s) in ${filePath} as SAFE? [y/n]: `);

        if (fileAnswer === "y" || fileAnswer === "yes") {
          for (const h of fileHotspots) {
            const ok = await markHotspot(token, h.key, "REVIEWED", "SAFE");
            if (ok) {
              totalReviewed++;
            } else {
              console.log(`    ❌ Failed: ${h.key}`);
            }
          }
          console.log(`    ✅ Marked ${fileHotspots.length} as SAFE`);
        } else {
          totalSkipped += fileHotspots.length;
          console.log(`    Skipped`);
        }
      }
    } else {
      totalSkipped += group.hotspots.length;
      console.log("  Skipped");
    }
  }

  rl.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Done! Reviewed: ${totalReviewed}, Skipped: ${totalSkipped}`);

  if (totalReviewed > 0) {
    console.log("\nRun 'pnpm sonarcloud:fetch' to verify updated status.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
