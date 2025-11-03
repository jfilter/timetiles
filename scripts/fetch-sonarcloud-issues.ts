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
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: any[];
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
    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Node.js SonarCloud Client",
    };

    console.log("Checking SonarCloud for latest analysis...");
    const response = await fetch(analysisUrl, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error(`SonarCloud API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { analyses: SonarCloudAnalysis[] };
    
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
      
      // Fetch issues
      await fetchSonarCloudIssues(token, projectKey);
    } else {
      console.log("⚠️  Latest commit has NOT been analyzed by SonarCloud yet");
      console.log(`   Analyzed: ${analyzedCommitSha}`);
      console.log(`   Current:  ${latestCommitSha}`);
      console.log("\n📝 To trigger analysis:");
      console.log("   1. Push your changes to GitHub");
      console.log("   2. Wait for GitHub Actions to complete");
      console.log("   3. Run this script again");
      console.log(`\n📊 View project at: https://sonarcloud.io/project/overview?id=${projectKey}`);
      
      // Try to get commits between
      try {
        const commitsSince = execSync(
          `git rev-list ${analyzedCommitSha}..${latestCommitSha} --oneline`,
          { encoding: "utf8" }
        ).trim();
        
        if (commitsSince) {
          const commitCount = commitsSince.split("\n").length;
          console.log(`\n📋 ${commitCount} commit(s) not yet analyzed:`);
          console.log(commitsSince);
        }
      } catch (error) {
        // Commit might not exist locally
        console.log("\n(Could not determine commits since last analysis)");
      }
    }
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
    
    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Node.js SonarCloud Client",
    };

    let allIssues: SonarCloudIssue[] = [];
    let page = 1;
    const pageSize = 100;
    let totalPages = 1;

    // Fetch all pages of issues
    while (page <= totalPages) {
      const issuesUrl = `https://sonarcloud.io/api/issues/search?componentKeys=${projectKey}&resolved=false&ps=${pageSize}&p=${page}`;
      
      const response = await fetch(issuesUrl, {
        method: "GET",
        headers: headers,
      });

      if (!response.ok) {
        throw new Error(`SonarCloud API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
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
    
    severities.forEach(severity => {
      issuesBySeverity[severity] = allIssues.filter(issue => issue.severity === severity);
    });
    
    types.forEach(type => {
      issuesByType[type] = allIssues.filter(issue => issue.type === type);
    });

    // Output summary
    console.log("\n=== SonarCloud Analysis Summary ===");
    console.log(`Total issues: ${allIssues.length}`);
    console.log("\nBy Severity:");
    severities.forEach(severity => {
      const count = issuesBySeverity[severity].length;
      if (count > 0) {
        const emoji = getEmojiBySeverity(severity);
        console.log(`  ${emoji} ${severity}: ${count}`);
      }
    });
    
    console.log("\nBy Type:");
    types.forEach(type => {
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
      criticalIssues.slice(0, 10).forEach(issue => {
        const file = issue.component.replace(`${projectKey}:`, "");
        const line = issue.line ? `:${issue.line}` : "";
        console.log(`  • ${file}${line}`);
        console.log(`    ${issue.message}`);
        console.log(`    Rule: ${issue.rule} | Severity: ${issue.severity}`);
        console.log("");
      });
    }

    // Save detailed report
    const reportPath = path.join(process.cwd(), ".claude", "archive", "sonarcloud-issues.json");
    const report = {
      timestamp: new Date().toISOString(),
      projectKey,
      summary: {
        total: allIssues.length,
        bySeverity: Object.fromEntries(
          severities.map(s => [s, issuesBySeverity[s].length])
        ),
        byType: Object.fromEntries(
          types.map(t => [t, issuesByType[t].length])
        ),
      },
      issues: allIssues,
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
 * Get emoji for severity level
 */
function getEmojiBySeverity(severity: string): string {
  switch (severity) {
    case "BLOCKER": return "🔴";
    case "CRITICAL": return "🟠";
    case "MAJOR": return "🟡";
    case "MINOR": return "🔵";
    case "INFO": return "⚪";
    default: return "⚫";
  }
}

/**
 * Get emoji for issue type
 */
function getEmojiByType(type: string): string {
  switch (type) {
    case "BUG": return "🐛";
    case "VULNERABILITY": return "🔓";
    case "CODE_SMELL": return "👃";
    case "SECURITY_HOTSPOT": return "🔥";
    default: return "📝";
  }
}

// Run the script
loadEnvFile();
checkLatestCommitAnalyzed().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});