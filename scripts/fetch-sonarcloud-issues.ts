/**
 * Fetches SonarCloud analysis results and code quality metrics
 *
 * This script checks if the latest Git commit has been analyzed by SonarCloud
 * and fetches code quality issues, generating a report for review.
 *
 * @module
 * @category Scripts
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import {
  fetchAllPages,
  fetchSonarJson,
  PAGE_SIZE,
  readSonarCredentials,
  SONAR_API,
  type SonarCredentials,
} from "./shared/sonarcloud";

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

interface CoverageFile {
  path: string;
  newLinesToCover: number;
  newUncoveredLines: number;
  newCoverage: number;
}

interface CoverageComponent {
  path: string;
  qualifier: string;
  measures: Array<{ metric: string; periods?: Array<{ index: number; value: string }> }>;
}

interface Paging {
  paging: { total: number; pageIndex: number; pageSize: number };
}

const SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
const TYPES = ["BUG", "VULNERABILITY", "CODE_SMELL", "SECURITY_HOTSPOT"];
const SEVERITY_EMOJI: Record<string, string> = { BLOCKER: "🔴", CRITICAL: "🟠", MAJOR: "🟡", MINOR: "🔵", INFO: "⚪" };
const TYPE_EMOJI: Record<string, string> = { BUG: "🐛", VULNERABILITY: "🔓", CODE_SMELL: "👃", SECURITY_HOTSPOT: "🔥" };

/** System git at a fixed path, so no PATH lookup decides which binary runs. */
const GIT = "/usr/bin/git";

const git = (args: string[]): string => execFileSync(GIT, args, { encoding: "utf8" }).trim();

const bearerHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "User-Agent": "Node.js SonarCloud Client",
});

const ofSeverity = (issues: SonarCloudIssue[], severity: string): SonarCloudIssue[] =>
  issues.filter((issue) => issue.severity === severity);

const ofType = (issues: SonarCloudIssue[], type: string): SonarCloudIssue[] =>
  issues.filter((issue) => issue.type === type);

const fileOf = (component: string, projectKey: string): string => component.replace(`${projectKey}:`, "");

/** Print how the analyzed commit relates to HEAD, listing unanalyzed commits when possible. */
const reportAnalyzedCommit = (analysis: SonarCloudAnalysis, latestCommitSha: string): void => {
  const analyzedCommitSha = analysis.revision;
  console.log(`Latest analyzed commit: ${analyzedCommitSha}`);
  console.log(`Analysis date: ${analysis.date}`);

  if (analyzedCommitSha === latestCommitSha) {
    console.log("✅ Latest commit has been analyzed by SonarCloud");
    return;
  }

  console.log("⚠️  Latest commit has NOT been analyzed by SonarCloud yet");
  console.log(`   Analyzed: ${analyzedCommitSha}`);
  console.log(`   Current:  ${latestCommitSha}`);
  console.log("   Showing results from last analyzed commit.\n");

  try {
    const commitsSince = git(["rev-list", `${analyzedCommitSha}..${latestCommitSha}`, "--oneline"]);
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
};

const fetchIssues = ({ token, projectKey }: SonarCredentials): Promise<SonarCloudIssue[]> =>
  fetchAllPages(
    (page) => `${SONAR_API}/issues/search?componentKeys=${projectKey}&resolved=false&ps=${PAGE_SIZE}&p=${page}`,
    bearerHeaders(token),
    "SonarCloud API",
    (data: Paging & { issues: SonarCloudIssue[] }) => data.issues
  );

const fetchSecurityHotspots = ({ token, projectKey }: SonarCredentials): Promise<SonarCloudHotspot[]> =>
  fetchAllPages(
    (page) => `${SONAR_API}/hotspots/search?projectKey=${projectKey}&status=TO_REVIEW&ps=${PAGE_SIZE}&p=${page}`,
    bearerHeaders(token),
    "SonarCloud hotspots API",
    (data: Paging & { hotspots: SonarCloudHotspot[] }) => data.hotspots
  );

const fetchQualityGateStatus = async ({ token, projectKey }: SonarCredentials): Promise<QualityGateStatus> => {
  const data = await fetchSonarJson<{ projectStatus: QualityGateStatus }>(
    `${SONAR_API}/qualitygates/project_status?projectKey=${projectKey}`,
    bearerHeaders(token),
    "SonarCloud quality gate API"
  );
  return data.projectStatus;
};

const toCoverageFile = (comp: CoverageComponent): CoverageFile | null => {
  if (comp.qualifier !== "FIL") return null;
  const getValue = (metric: string): number => {
    const m = comp.measures.find((x) => x.metric === metric);
    return Number.parseFloat(m?.periods?.[0]?.value ?? "0");
  };
  const linesToCover = getValue("new_lines_to_cover");
  if (linesToCover === 0) return null;
  return {
    path: comp.path,
    newLinesToCover: linesToCover,
    newUncoveredLines: getValue("new_uncovered_lines"),
    newCoverage: getValue("new_coverage"),
  };
};

/** Per-file coverage on new code, sorted by most uncovered lines. */
const fetchNewCodeCoverage = async ({ token, projectKey }: SonarCredentials): Promise<CoverageFile[]> => {
  const components = await fetchAllPages(
    (page) =>
      `${SONAR_API}/measures/component_tree?component=${projectKey}` +
      `&metricKeys=new_uncovered_lines,new_lines_to_cover,new_coverage` +
      `&qualifier=FIL&ps=${PAGE_SIZE}&p=${page}` +
      `&s=metricPeriod&metricSort=new_uncovered_lines&metricSortFilter=withMeasuresOnly&asc=false&metricPeriodSort=1`,
    bearerHeaders(token),
    "SonarCloud coverage API",
    (data: Paging & { components: CoverageComponent[] }) => data.components
  );
  const files = components.map(toCoverageFile).filter((file): file is CoverageFile => file !== null);
  return files.sort((a, b) => b.newUncoveredLines - a.newUncoveredLines);
};

const printIssueSummary = (issues: SonarCloudIssue[], projectKey: string): void => {
  console.log("\n=== SonarCloud Analysis Summary ===");
  console.log(`Total issues: ${issues.length}`);
  console.log("\nBy Severity:");
  for (const severity of SEVERITIES) {
    const count = ofSeverity(issues, severity).length;
    if (count > 0) console.log(`  ${SEVERITY_EMOJI[severity] ?? "⚫"} ${severity}: ${count}`);
  }

  console.log("\nBy Type:");
  for (const type of TYPES) {
    const count = ofType(issues, type).length;
    if (count > 0) console.log(`  ${TYPE_EMOJI[type] ?? "📝"} ${type}: ${count}`);
  }

  const criticalIssues = [...ofSeverity(issues, "BLOCKER"), ...ofSeverity(issues, "CRITICAL")];
  if (criticalIssues.length === 0) return;
  console.log("\n⚠️  Critical Issues to Address:");
  for (const issue of criticalIssues.slice(0, 10)) {
    const line = issue.line ? `:${issue.line}` : "";
    console.log(`  • ${fileOf(issue.component, projectKey)}${line}`);
    console.log(`    ${issue.message}`);
    console.log(`    Rule: ${issue.rule} | Severity: ${issue.severity}`);
    console.log("");
  }
};

const printHotspots = (hotspots: SonarCloudHotspot[], projectKey: string): void => {
  if (hotspots.length === 0) {
    console.log("\n✅ No Security Hotspots to review");
    return;
  }
  console.log(`\n🔥 Security Hotspots (TO_REVIEW): ${hotspots.length}`);
  for (const prob of ["HIGH", "MEDIUM", "LOW"]) {
    const count = hotspots.filter((h) => h.vulnerabilityProbability === prob).length;
    if (count > 0) console.log(`  ${prob}: ${count}`);
  }

  console.log("\n  Top hotspots:");
  for (const h of hotspots.slice(0, 10)) {
    const line = h.line ? `:${h.line}` : "";
    console.log(`  • ${fileOf(h.component, projectKey)}${line}`);
    console.log(`    ${h.message} [${h.vulnerabilityProbability}] (${h.securityCategory})`);
  }
};

const printQualityGate = (qualityGate: QualityGateStatus): void => {
  if (qualityGate.status === "OK") {
    console.log("\n✅ Quality Gate: PASSED");
    return;
  }
  console.log(`\n❌ Quality Gate: ${qualityGate.status}`);
  const failedConditions = qualityGate.conditions.filter((c) => c.status !== "OK");
  if (failedConditions.length === 0) return;
  console.log("  Failed conditions:");
  for (const c of failedConditions) {
    console.log(`  • ${c.metricKey}: ${c.actualValue} (required ${c.comparator} ${c.errorThreshold})`);
  }
};

const printCoverage = (coverageFiles: CoverageFile[]): void => {
  const uncoveredFiles = coverageFiles.filter((f) => f.newUncoveredLines > 0);
  if (uncoveredFiles.length === 0) {
    console.log("\n✅ All new code is covered");
    return;
  }
  const totalUncovered = uncoveredFiles.reduce((sum, f) => sum + f.newUncoveredLines, 0);
  const totalToCover = uncoveredFiles.reduce((sum, f) => sum + f.newLinesToCover, 0);

  console.log(`\n📊 Coverage on New Code: ${((1 - totalUncovered / totalToCover) * 100).toFixed(1)}%`);
  console.log(`  ${totalUncovered} uncovered lines / ${totalToCover} new lines across ${uncoveredFiles.length} files`);
  console.log("\n  Files with most uncovered new lines:");
  for (const f of uncoveredFiles.slice(0, 20)) {
    console.log(
      `  • ${f.path} — ${f.newUncoveredLines} uncovered / ${f.newLinesToCover} new (${f.newCoverage.toFixed(0)}%)`
    );
  }
};

/** Fetch issues, hotspots, quality gate and coverage, print them and save the JSON report. */
const fetchSonarCloudIssues = async (credentials: SonarCredentials): Promise<void> => {
  const { projectKey } = credentials;
  try {
    const allIssues = await fetchIssues(credentials);
    printIssueSummary(allIssues, projectKey);

    console.log("\nFetching Security Hotspots...");
    const hotspots = await fetchSecurityHotspots(credentials);
    printHotspots(hotspots, projectKey);

    console.log("\nFetching Quality Gate status...");
    const qualityGate = await fetchQualityGateStatus(credentials);
    printQualityGate(qualityGate);

    console.log("\nFetching coverage on new code...");
    const coverageFiles = await fetchNewCodeCoverage(credentials);
    printCoverage(coverageFiles);

    const reportPath = path.join(process.cwd(), ".claude", "archive", "sonarcloud-issues.json");
    const report = {
      timestamp: new Date().toISOString(),
      projectKey,
      summary: {
        total: allIssues.length,
        bySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, ofSeverity(allIssues, s).length])),
        byType: Object.fromEntries(TYPES.map((t) => [t, ofType(allIssues, t).length])),
      },
      issues: allIssues,
      hotspots,
      qualityGate,
      coverageFiles,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    console.log(`📊 View online: https://sonarcloud.io/project/issues?id=${projectKey}&resolved=false`);

    if (ofSeverity(allIssues, "BLOCKER").length > 0) {
      console.error("\n❌ Found BLOCKER issues that must be fixed");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error fetching issues:", error);
    process.exit(1);
  }
};

/** Check whether SonarCloud has analyzed HEAD, then report the latest analysis results. */
const checkLatestCommitAnalyzed = async (credentials: SonarCredentials): Promise<void> => {
  const { token, projectKey } = credentials;
  try {
    const latestCommitSha = git(["rev-parse", "HEAD"]);
    console.log(`Latest commit SHA: ${latestCommitSha}`);

    console.log("Checking SonarCloud for latest analysis...");
    const data = await fetchSonarJson<{ analyses?: SonarCloudAnalysis[] }>(
      `${SONAR_API}/project_analyses/search?project=${projectKey}&ps=1`,
      bearerHeaders(token),
      "SonarCloud API"
    );

    const latestAnalysis = data.analyses?.[0];
    if (!latestAnalysis) {
      console.log("⚠️  No analyses found in SonarCloud");
      console.log(`📊 View project at: https://sonarcloud.io/project/overview?id=${projectKey}`);
      return;
    }

    reportAnalyzedCommit(latestAnalysis, latestCommitSha);

    // Always fetch issues (from latest analyzed commit)
    await fetchSonarCloudIssues(credentials);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

const main = async (): Promise<void> => {
  try {
    await checkLatestCommitAnalyzed(readSonarCredentials());
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

void main();
