const fs = require("fs");
const path = require("path");

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach(line => {
      if (line.trim() && !line.startsWith("#")) {
        const [key, value] = line.split("=");
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

loadEnvFile();

async function fetchAllSonarCloudIssues() {
  // Get configuration from environment variables
  const token = process.env.SONARCLOUD_TOKEN;
  const projectKey = process.env.SONARCLOUD_PROJECT_KEY;
  const baseUrl = "https://sonarcloud.io/api/issues/search";

  if (!token) {
    throw new Error("SONARCLOUD_TOKEN environment variable is required");
  }

  if (!projectKey) {
    throw new Error("SONARCLOUD_PROJECT_KEY environment variable is required");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "Node.js SonarCloud Client",
  };

  let allIssues = [];
  let page = 1;
  let totalIssues = 0;

  console.log(`Fetching issues from SonarCloud for project: ${projectKey}...`);

  try {
    while (true) {
      const params = new URLSearchParams({
        componentKeys: projectKey,
        ps: "500", // Max page size
        p: page.toString(),
        statuses: "OPEN", // Only fetch open issues
      });

      console.log(`Fetching page ${page}...`);

      const response = await fetch(`${baseUrl}?${params}`, {
        method: "GET",
        headers: headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
      }

      const data = await response.json();
      const issues = data.issues || [];

      allIssues.push(...issues);
      totalIssues = data.total || 0;

      console.log(`Page ${page}: ${issues.length} issues (Total so far: ${allIssues.length}/${totalIssues})`);

      // Check if we've got all issues
      if (allIssues.length >= totalIssues || issues.length === 0) {
        break;
      }

      page++;
    }

    // Create output data
    const output = {
      metadata: {
        project: projectKey,
        totalIssues: allIssues.length,
        fetchedAt: new Date().toISOString(),
        summary: generateSummary(allIssues),
      },
      issues: allIssues,
    };

    console.log(`\n✅ Successfully fetched ${allIssues.length} issues`);
    console.log(`📊 Summary:`, output.metadata.summary);

    return output;
  } catch (error) {
    console.error("❌ Error fetching issues:", error.message);
    throw error;
  }
}

function generateSummary(issues) {
  const summary = {
    bySeverity: {},
    byType: {},
    byStatus: {},
    byComponent: {},
  };

  issues.forEach((issue) => {
    // Count by severity
    const severity = issue.severity || "Unknown";
    summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;

    // Count by type
    const type = issue.type || "Unknown";
    summary.byType[type] = (summary.byType[type] || 0) + 1;

    // Count by status
    const status = issue.status || "Unknown";
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

    // Count by component (file)
    const component = issue.component || "Unknown";
    summary.byComponent[component] = (summary.byComponent[component] || 0) + 1;
  });

  return summary;
}

// Alternative function to save issues in a format optimized for Claude Code
async function saveForClaudeCode() {
  const data = await fetchAllSonarCloudIssues();

  // Create a simplified format for Claude Code
  const claudeFormat = {
    project: "timetiles",
    totalIssues: data.issues.length,
    issuesByFile: {},
    summary: data.metadata.summary,
    detailedIssues: data.issues.map((issue) => ({
      key: issue.key,
      rule: issue.rule,
      severity: issue.severity,
      type: issue.type,
      status: issue.status,
      message: issue.message,
      component: issue.component,
      line: issue.line,
      textRange: issue.textRange,
      creationDate: issue.creationDate,
      updateDate: issue.updateDate,
      effort: issue.effort,
      debt: issue.debt,
      tags: issue.tags,
    })),
  };

  // Group issues by file
  data.issues.forEach((issue) => {
    const file = issue.component || "Unknown";
    if (!claudeFormat.issuesByFile[file]) {
      claudeFormat.issuesByFile[file] = [];
    }
    claudeFormat.issuesByFile[file].push({
      rule: issue.rule,
      severity: issue.severity,
      type: issue.type,
      message: issue.message,
      line: issue.line,
    });
  });

  const archiveDir = path.join(__dirname, "..", "archive");
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
  const claudeFilename = path.join(archiveDir, "sonarcloud-issues.json");
  fs.writeFileSync(claudeFilename, JSON.stringify(claudeFormat, null, 2));

  console.log(`\n🤖 Claude Code optimized file saved: ${claudeFilename}`);

  return claudeFormat;
}

// Run the script
if (require.main === module) {
  saveForClaudeCode()
    .then(() => {
      console.log("\n🎉 All done! You can now share the JSON file with Claude Code.");
    })
    .catch((error) => {
      console.error("Failed:", error);
      process.exit(1);
    });
}

module.exports = { fetchAllSonarCloudIssues, saveForClaudeCode };
