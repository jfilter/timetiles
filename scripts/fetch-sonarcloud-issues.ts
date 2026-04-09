/**
 * Fetches SonarCloud analysis results and code quality metrics
 *
 * This script checks if the latest Git commit has been analyzed by SonarCloud
 * and fetches code quality issues, generating a report for review.
 *
 * @module
 * @category Scripts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface SonarCloudAnalysis {
  key: string;
  date: string;
  revision?: string;
  events?: Array<{ key: string; category: string; name: string }>;
}

interface SonarCloudIssue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  project: string;
  line?: number;
  hash?: string;
  textRange?: { startLine: number; endLine: number; startOffset: number; endOffset: number };
  flows: unknown[];
  status: string;
  message: string;
  effort?: string;
  debt?: string;
  author?: string;
  tags: string[];
  creationDate: string;
  updateDate: string;
  type: string;
  scope: string;
  quickFixAvailable: boolean;
  codeVariants?: string[];
}

interface SonarCloudHotspot {
  key: string;
  component: string;
  project: string;
  securityCategory: string;
  vulnerabilityProbability: string;
  status: string;
  line?: number;
  message: string;
  author?: string;
  creationDate: string;
  updateDate: string;
  textRange?: { startLine: number; endLine: number; startOffset: number; endOffset: number };
}

interface QualityGateCondition {
  status: string;
  metricKey: string;
  comparator: string;
  errorThreshold: string;
  actualValue: string;
}

interface QualityGateStatus {
  status: string;
  conditions: QualityGateCondition[];
}

/**
 * Load environment variables from .env.local file
 */
function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      if (line.trim() && !line.startsWith("#")) {
        const [key, value] = line.split("=");
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

/**
 * Check if the latest commit has been analyzed by SonarCloud
 */
async function checkLatestCommitAnalyzed(): Promise<void> {
  const token = process.env.SONARCLOUD_TOKEN;
  const projectKey = process.env.SONARCLOUD_PROJECT_KEY;

  if (!token) {
    throw new Error("SONARCLOUD_TOKEN environment variable is required");
  }

  if (!projectKey) {
    throw new Error("SONARCLOUD_PROJECT_KEY environment variable is required");
  }

  try {
    // Get latest commit SHA from GitHub
    const latestCommitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    console.log(`Latest commit SHA: ${latestCommitSha}`);

    // Get latest analysis from SonarCloud
    const analysisUrl = `https://sonarcloud.io/api/project_analyses/search?project=${projectKey}&ps=1`;
    const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Node.js SonarCloud Client" };

    console.log("Checking SonarCloud for latest analysis...");
    const response = await fetch(analysisUrl, { method: "GET", headers: headers });

    if (!response.ok) {
      throw new Error(`SonarCloud API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { analyses: SonarCloudAnalysis[] };

    if (!data.analyses || data.analyses.length === 0) {
      console.log("⚠️  No analyses found in SonarCloud");
      console.log(`📊 View project at: https://sonarcloud.io/project/overview?id=${projectKey}`);
      return;
    }

    const latestAnalysis = data.analyses[0];
    const analyzedCommitSha = latestAnalysis.revision;
    const analysisDate = latestAnalysis.date;

    console.log(`Latest analyzed commit: ${analyzedCommitSha}`);
    console.log(`Analysis date: ${analysisDate}`);

    // Compare commits
    if (analyzedCommitSha === latestCommitSha) {
      console.log("✅ Latest commit has been analyzed by SonarCloud");
    } else {
      console.log("⚠️  Latest commit has NOT been analyzed by SonarCloud yet");
      console.log(`   Analyzed: ${analyzedCommitSha}`);
      console.log(`   Current:  ${latestCommitSha}`);
      console.log("   Showing results from last analyzed commit.\n");

      // Try to get commits between
      try {
        const commitsSince = execSync(`git rev-list ${analyzedCommitSha}..${latestCommitSha} --oneline`, {
          encoding: "utf8",
        }).trim();

        if (commitsSince) {
          const commitCount = commitsSince.split("\n").length;
          console.log(`\n📋 ${commitCount} commit(s) not yet analyzed:`);
          console.log(commitsSince);
        }
      } catch (gitError: unknown) {
        // Commit might not exist locally (e.g., shallow clone)
        const reason = gitError instanceof Error ? gitError.message : String(gitError);
        console.log(`\n(Could not determine commits since last analysis: ${reason})`);
      }
    }

    // Always fetch issues (from latest analyzed commit)
    await fetchSonarCloudIssues(token, projectKey);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

/**
 * Fetch SonarCloud issues for the project
 */
async function fetchSonarCloudIssues(token: string, projectKey: string): Promise<void> {
  try {
    const severities = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
    const types = ["BUG", "VULNERABILITY", "CODE_SMELL", "SECURITY_HOTSPOT"];

    const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Node.js SonarCloud Client" };

    let allIssues: SonarCloudIssue[] = [];
    let page = 1;
    const pageSize = 100;
    let totalPages = 1;

    // Fetch all pages of issues
    while (page <= totalPages) {
      const issuesUrl = `https://sonarcloud.io/api/issues/search?componentKeys=${projectKey}&resolved=false&ps=${pageSize}&p=${page}`;

      const response = await fetch(issuesUrl, { method: "GET", headers: headers });

      if (!response.ok) {
        throw new Error(`SonarCloud API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        total: number;
        p: number;
        ps: number;
        paging: { total: number; pageIndex: number; pageSize: number };
        issues: SonarCloudIssue[];
      };

      allIssues = allIssues.concat(data.issues);
      totalPages = Math.ceil(data.paging.total / data.paging.pageSize);
      page++;
    }

    // Sort and categorize issues
    const issuesBySeverity: Record<string, SonarCloudIssue[]> = {};
    const issuesByType: Record<string, SonarCloudIssue[]> = {};

    severities.forEach((severity) => {
      issuesBySeverity[severity] = allIssues.filter((issue) => issue.severity === severity);
    });

    types.forEach((type) => {
      issuesByType[type] = allIssues.filter((issue) => issue.type === type);
    });

    // Output summary
    console.log("\n=== SonarCloud Analysis Summary ===");
    console.log(`Total issues: ${allIssues.length}`);
    console.log("\nBy Severity:");
    severities.forEach((severity) => {
      const count = issuesBySeverity[severity].length;
      if (count > 0) {
        const emoji = getEmojiBySeverity(severity);
        console.log(`  ${emoji} ${severity}: ${count}`);
      }
    });

    console.log("\nBy Type:");
    types.forEach((type) => {
      const count = issuesByType[type].length;
      if (count > 0) {
        const emoji = getEmojiByType(type);
        console.log(`  ${emoji} ${type}: ${count}`);
      }
    });

    // Show top issues
    const criticalIssues = [...issuesBySeverity.BLOCKER, ...issuesBySeverity.CRITICAL];
    if (criticalIssues.length > 0) {
      console.log("\n⚠️  Critical Issues to Address:");
      criticalIssues.slice(0, 10).forEach((issue) => {
        const file = issue.component.replace(`${projectKey}:`, "");
        const line = issue.line ? `:${issue.line}` : "";
        console.log(`  • ${file}${line}`);
        console.log(`    ${issue.message}`);
        console.log(`    Rule: ${issue.rule} | Severity: ${issue.severity}`);
        console.log("");
      });
    }

    // Fetch Security Hotspots
    console.log("\nFetching Security Hotspots...");
    const hotspots = await fetchSecurityHotspots(token, projectKey);

    if (hotspots.length > 0) {
      console.log(`\n🔥 Security Hotspots (TO_REVIEW): ${hotspots.length}`);

      const hotspotsByProbability: Record<string, SonarCloudHotspot[]> = {};
      for (const h of hotspots) {
        const prob = h.vulnerabilityProbability;
        if (!hotspotsByProbability[prob]) hotspotsByProbability[prob] = [];
        hotspotsByProbability[prob].push(h);
      }

      for (const prob of ["HIGH", "MEDIUM", "LOW"]) {
        const count = hotspotsByProbability[prob]?.length ?? 0;
        if (count > 0) {
          console.log(`  ${prob}: ${count}`);
        }
      }

      console.log("\n  Top hotspots:");
      hotspots.slice(0, 10).forEach((h) => {
        const file = h.component.replace(`${projectKey}:`, "");
        const line = h.line ? `:${h.line}` : "";
        console.log(`  • ${file}${line}`);
        console.log(`    ${h.message} [${h.vulnerabilityProbability}] (${h.securityCategory})`);
      });
    } else {
      console.log("\n✅ No Security Hotspots to review");
    }

    // Fetch Quality Gate status
    console.log("\nFetching Quality Gate status...");
    const qualityGate = await fetchQualityGateStatus(token, projectKey);

    if (qualityGate.status === "OK") {
      console.log("\n✅ Quality Gate: PASSED");
    } else {
      console.log(`\n❌ Quality Gate: ${qualityGate.status}`);
      const failedConditions = qualityGate.conditions.filter((c) => c.status !== "OK");
      if (failedConditions.length > 0) {
        console.log("  Failed conditions:");
        failedConditions.forEach((c) => {
          console.log(`  • ${c.metricKey}: ${c.actualValue} (required ${c.comparator} ${c.errorThreshold})`);
        });
      }
    }

    // Fetch coverage on new code
    console.log("\nFetching coverage on new code...");
    const coverageFiles = await fetchNewCodeCoverage(token, projectKey);

    const uncoveredFiles = coverageFiles.filter((f) => f.newUncoveredLines > 0);
    if (uncoveredFiles.length > 0) {
      const totalUncovered = uncoveredFiles.reduce((sum, f) => sum + f.newUncoveredLines, 0);
      const totalToCover = uncoveredFiles.reduce((sum, f) => sum + f.newLinesToCover, 0);

      console.log(`\n📊 Coverage on New Code: ${((1 - totalUncovered / totalToCover) * 100).toFixed(1)}%`);
      console.log(
        `  ${totalUncovered} uncovered lines / ${totalToCover} new lines across ${uncoveredFiles.length} files`
      );
      console.log("\n  Files with most uncovered new lines:");
      uncoveredFiles.slice(0, 20).forEach((f) => {
        console.log(
          `  • ${f.path} — ${f.newUncoveredLines} uncovered / ${f.newLinesToCover} new (${f.newCoverage.toFixed(0)}%)`
        );
      });
    } else {
      console.log("\n✅ All new code is covered");
    }

    // Save detailed report
    const reportPath = path.join(process.cwd(), ".claude", "archive", "sonarcloud-issues.json");
    const report = {
      timestamp: new Date().toISOString(),
      projectKey,
      summary: {
        total: allIssues.length,
        bySeverity: Object.fromEntries(severities.map((s) => [s, issuesBySeverity[s].length])),
        byType: Object.fromEntries(types.map((t) => [t, issuesByType[t].length])),
      },
      issues: allIssues,
      hotspots,
      qualityGate,
      coverageFiles,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    console.log(`📊 View online: https://sonarcloud.io/project/issues?id=${projectKey}&resolved=false`);

    // Exit with error if there are blocker issues
    if (issuesBySeverity.BLOCKER.length > 0) {
      console.error("\n❌ Found BLOCKER issues that must be fixed");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error fetching issues:", error);
    process.exit(1);
  }
}

/**
 * Fetch Security Hotspots for the project
 */
async function fetchSecurityHotspots(token: string, projectKey: string): Promise<SonarCloudHotspot[]> {
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Node.js SonarCloud Client" };

  let allHotspots: SonarCloudHotspot[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `https://sonarcloud.io/api/hotspots/search?projectKey=${projectKey}&status=TO_REVIEW&ps=${pageSize}&p=${page}`;
    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      throw new Error(`SonarCloud hotspots API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      paging: { total: number; pageIndex: number; pageSize: number };
      hotspots: SonarCloudHotspot[];
    };

    allHotspots = allHotspots.concat(data.hotspots);
    totalPages = Math.ceil(data.paging.total / data.paging.pageSize);
    page++;
  }

  return allHotspots;
}

/**
 * Fetch Quality Gate status for the project
 */
async function fetchQualityGateStatus(token: string, projectKey: string): Promise<QualityGateStatus> {
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Node.js SonarCloud Client" };
  const url = `https://sonarcloud.io/api/qualitygates/project_status?projectKey=${projectKey}`;
  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    throw new Error(`SonarCloud quality gate API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { projectStatus: QualityGateStatus };
  return data.projectStatus;
}

interface CoverageFile {
  path: string;
  newLinesToCover: number;
  newUncoveredLines: number;
  newCoverage: number;
}

/**
 * Fetch per-file coverage on new code, sorted by most uncovered lines
 */
async function fetchNewCodeCoverage(token: string, projectKey: string): Promise<CoverageFile[]> {
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Node.js SonarCloud Client" };

  const files: CoverageFile[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  while (page <= totalPages) {
    const url =
      `https://sonarcloud.io/api/measures/component_tree?component=${projectKey}` +
      `&metricKeys=new_uncovered_lines,new_lines_to_cover,new_coverage` +
      `&qualifier=FIL&ps=${pageSize}&p=${page}` +
      `&s=metricPeriod&metricSort=new_uncovered_lines&metricSortFilter=withMeasuresOnly&asc=false&metricPeriodSort=1`;

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`SonarCloud coverage API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      paging: { total: number; pageIndex: number; pageSize: number };
      components: Array<{
        path: string;
        qualifier: string;
        measures: Array<{ metric: string; periods?: Array<{ index: number; value: string }> }>;
      }>;
    };

    for (const comp of data.components) {
      if (comp.qualifier !== "FIL") continue;
      const getValue = (metric: string): number => {
        const m = comp.measures.find((x) => x.metric === metric);
        return Number.parseFloat(m?.periods?.[0]?.value ?? "0");
      };
      const linesToCover = getValue("new_lines_to_cover");
      if (linesToCover === 0) continue;

      files.push({
        path: comp.path,
        newLinesToCover: linesToCover,
        newUncoveredLines: getValue("new_uncovered_lines"),
        newCoverage: getValue("new_coverage"),
      });
    }

    totalPages = Math.ceil(data.paging.total / data.paging.pageSize);
    page++;
  }

  // Sort by uncovered lines descending
  files.sort((a, b) => b.newUncoveredLines - a.newUncoveredLines);
  return files;
}

/**
 * Get emoji for severity level
 */
function getEmojiBySeverity(severity: string): string {
  switch (severity) {
    case "BLOCKER":
      return "🔴";
    case "CRITICAL":
      return "🟠";
    case "MAJOR":
      return "🟡";
    case "MINOR":
      return "🔵";
    case "INFO":
      return "⚪";
    default:
      return "⚫";
  }
}

/**
 * Get emoji for issue type
 */
function getEmojiByType(type: string): string {
  switch (type) {
    case "BUG":
      return "🐛";
    case "VULNERABILITY":
      return "🔓";
    case "CODE_SMELL":
      return "👃";
    case "SECURITY_HOTSPOT":
      return "🔥";
    default:
      return "📝";
  }
}

// Run the script
async function main(): Promise<void> {
  loadEnvFile();
  await checkLatestCommitAnalyzed();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
