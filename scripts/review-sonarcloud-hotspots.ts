/**
 * Review and bulk-resolve SonarCloud Security Hotspots via API.
 *
 * Groups hotspots by category and lets you mark them as SAFE or skip.
 * Run with: pnpm hotspots:review
 *
 * @module
 * @category Scripts
 */

import * as readline from "readline";

import { fetchAllPages, PAGE_SIZE, readSonarCredentials, SONAR_API, type SonarCredentials } from "./shared/sonarcloud";

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

interface ReviewOptions {
  allSafe: boolean;
  dryRun: boolean;
  filterCategory?: string;
}

interface ReviewTally {
  reviewed: number;
  skipped: number;
}

const SEPARATOR = "=".repeat(60);

const basicAuth = (token: string): string => `Basic ${Buffer.from(token + ":").toString("base64")}`;

const stripProjectKey = (component: string): string => {
  const colonIndex = component.indexOf(":");
  return colonIndex >= 0 ? component.slice(colonIndex + 1) : component;
};

const groupHotspots = (hotspots: SonarCloudHotspot[]): GroupedHotspots[] => {
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
};

const markHotspot = async (
  token: string,
  hotspotKey: string,
  status: string,
  resolution?: string
): Promise<boolean> => {
  const params = new URLSearchParams({ hotspot: hotspotKey, status });
  if (resolution) {
    params.set("resolution", resolution);
  }

  const response = await fetch(`${SONAR_API}/hotspots/change_status`, {
    method: "POST",
    headers: { Authorization: basicAuth(token), "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  return response.status === 204;
};

const markSafe = (token: string, hotspot: SonarCloudHotspot): Promise<boolean> =>
  markHotspot(token, hotspot.key, "REVIEWED", "SAFE");

const ask = (rl: readline.Interface, question: string): Promise<string> =>
  new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim().toLowerCase()));
  });

const parseOptions = (args: string[]): ReviewOptions => ({
  allSafe: args.includes("--all-safe"),
  dryRun: args.includes("--dry-run"),
  filterCategory: args.find((a) => a.startsWith("--category="))?.split("=")[1],
});

const fetchHotspots = ({ token, projectKey }: SonarCredentials): Promise<SonarCloudHotspot[]> =>
  fetchAllPages(
    (page) => `${SONAR_API}/hotspots/search?projectKey=${projectKey}&status=TO_REVIEW&ps=${PAGE_SIZE}&p=${page}`,
    { Authorization: basicAuth(token) },
    "SonarCloud hotspots API",
    (data: { paging: { total: number; pageIndex: number; pageSize: number }; hotspots: SonarCloudHotspot[] }) =>
      data.hotspots
  );

const printVerifyHint = (reviewed: number, leadingNewline: boolean): void => {
  if (reviewed > 0) {
    console.log(`${leadingNewline ? "\n" : ""}Run 'pnpm sonarcloud:fetch' to verify updated status.`);
  }
};

/** Non-interactive `--all-safe`: mark every hotspot SAFE. */
const markAllSafe = async (token: string, hotspots: SonarCloudHotspot[], dryRun: boolean): Promise<void> => {
  if (dryRun) {
    console.log(`\n[DRY RUN] Would mark ${hotspots.length} hotspots as SAFE`);
    return;
  }

  console.log(`\nMarking all ${hotspots.length} hotspots as SAFE...`);
  let reviewed = 0;
  for (const [i, h] of hotspots.entries()) {
    if (await markSafe(token, h)) {
      reviewed++;
    } else {
      console.log(`  ❌ Failed: ${stripProjectKey(h.component)}:${h.line}`);
    }
    process.stdout.write(`\r  Progress: ${i + 1}/${hotspots.length}`);
  }
  console.log(`\n\n✅ Marked ${reviewed} hotspots as SAFE`);
  printVerifyHint(reviewed, false);
};

const printGroup = (group: GroupedHotspots): void => {
  console.log(`\n${SEPARATOR}`);
  console.log(`Category: ${group.category} [${group.probability}]`);
  console.log(`${group.hotspots.length} hotspots in ${group.files.size} files:`);

  for (const [filePath, fileHotspots] of group.files) {
    console.log(`  ${filePath}`);
    for (const h of fileHotspots) {
      const line = h.line ? `:${h.line}` : "";
      console.log(`    L${line} ${h.message}`);
    }
  }
};

const markGroupSafe = async (token: string, group: GroupedHotspots, tally: ReviewTally): Promise<void> => {
  let count = 0;
  for (const h of group.hotspots) {
    const ok = await markSafe(token, h);
    count++;
    if (ok) {
      tally.reviewed++;
      process.stdout.write(`\r  Reviewed ${count}/${group.hotspots.length}`);
    } else {
      console.log(`\n  ❌ Failed to mark hotspot ${h.key}`);
    }
  }
  console.log(`\n  ✅ Marked ${count} hotspots as SAFE`);
};

const reviewFileByFile = async (
  rl: readline.Interface,
  token: string,
  group: GroupedHotspots,
  tally: ReviewTally
): Promise<void> => {
  for (const [filePath, fileHotspots] of group.files) {
    const fileAnswer = await ask(rl, `  Mark ${fileHotspots.length} hotspot(s) in ${filePath} as SAFE? [y/n]: `);

    if (fileAnswer !== "y" && fileAnswer !== "yes") {
      tally.skipped += fileHotspots.length;
      console.log(`    Skipped`);
      continue;
    }
    for (const h of fileHotspots) {
      if (await markSafe(token, h)) {
        tally.reviewed++;
      } else {
        console.log(`    ❌ Failed: ${h.key}`);
      }
    }
    console.log(`    ✅ Marked ${fileHotspots.length} as SAFE`);
  }
};

/** Interactive review, one prompt per category. */
const reviewInteractively = async (token: string, groups: GroupedHotspots[], dryRun: boolean): Promise<void> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const tally: ReviewTally = { reviewed: 0, skipped: 0 };

  for (const group of groups) {
    printGroup(group);

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
      await markGroupSafe(token, group, tally);
    } else if (answer === "f" || answer === "file") {
      await reviewFileByFile(rl, token, group, tally);
    } else {
      tally.skipped += group.hotspots.length;
      console.log("  Skipped");
    }
  }

  rl.close();

  console.log(`\n${SEPARATOR}`);
  console.log(`Done! Reviewed: ${tally.reviewed}, Skipped: ${tally.skipped}`);
  printVerifyHint(tally.reviewed, true);
};

/** Hotspots in the requested category, or all of them; null when the category has none. */
const filterByCategory = (hotspots: SonarCloudHotspot[], category: string | undefined): SonarCloudHotspot[] | null => {
  if (!category) return hotspots;
  const filtered = hotspots.filter((h) => h.securityCategory === category);
  if (filtered.length === 0) {
    console.log(`\nNo hotspots found for category "${category}"`);
    return null;
  }
  console.log(`\nFiltered to category "${category}": ${filtered.length} hotspots`);
  return filtered;
};

const run = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const credentials = readSonarCredentials();

  console.log("Fetching Security Hotspots from SonarCloud...");
  const allHotspots = await fetchHotspots(credentials);

  if (allHotspots.length === 0) {
    console.log("\n✅ No Security Hotspots to review!");
    return;
  }

  const hotspots = filterByCategory(allHotspots, options.filterCategory);
  if (!hotspots) return;

  const groups = groupHotspots(hotspots);
  console.log(`\nFound ${hotspots.length} hotspots in ${groups.length} categories:\n`);
  groups.forEach((g, i) => {
    console.log(
      `  ${i + 1}. ${g.category} [${g.probability}] — ${g.hotspots.length} hotspots in ${g.files.size} files`
    );
  });

  if (options.allSafe) {
    await markAllSafe(credentials.token, hotspots, options.dryRun);
    return;
  }
  await reviewInteractively(credentials.token, groups, options.dryRun);
};

const main = async (): Promise<void> => {
  try {
    await run();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

void main();
