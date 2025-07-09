#!/usr/bin/env tsx

/**
 * Migration Script for Parallel Testing
 *
 * This script helps migrate existing tests to use the new parallel testing infrastructure.
 * It analyzes test files and provides recommendations for changes needed.
 */

import fs from "fs";
import path from "path";

interface TestFileAnalysis {
  filePath: string;
  hasPayloadOperations: boolean;
  hasDatabaseAccess: boolean;
  hasSharedState: boolean;
  hasFileOperations: boolean;
  hasHardcodedData: boolean;
  recommendations: string[];
}

function analyzeTestFile(filePath: string): TestFileAnalysis {
  const content = fs.readFileSync(filePath, "utf-8");
  const recommendations: string[] = [];

  // Check for Payload operations
  const hasPayloadOperations = /payload\.(create|update|delete|find)/g.test(
    content,
  );
  if (hasPayloadOperations) {
    recommendations.push("Use isolated SeedManager for Payload operations");
  }

  // Check for database access
  const hasDatabaseAccess = /payload\.db|database|drizzle/g.test(content);
  if (hasDatabaseAccess) {
    recommendations.push("Ensure database isolation using setupIsolatedTest()");
  }

  // Check for shared state
  const hasSharedState = /global\.|process\.env|shared|cache/g.test(content);
  if (hasSharedState) {
    recommendations.push("Isolate shared state within test boundaries");
  }

  // Check for file operations
  const hasFileOperations = /fs\.|writeFile|readFile|createFile/g.test(content);
  if (hasFileOperations) {
    recommendations.push("Use unique file names per test to avoid conflicts");
  }

  // Check for hardcoded data
  const hasHardcodedData = /"test@example\.com"|"test-.*"|'test-.*'/g.test(
    content,
  );
  if (hasHardcodedData) {
    recommendations.push("Use dynamic test data with unique identifiers");
  }

  return {
    filePath,
    hasPayloadOperations,
    hasDatabaseAccess,
    hasSharedState,
    hasFileOperations,
    hasHardcodedData,
    recommendations,
  };
}

function generateMigrationReport(): void {
  console.log("🔍 Analyzing test files for parallel testing migration...\n");

  // Find all test files
  const testFiles = globSync("__tests__/**/*.{test,spec}.{js,ts}", {
    ignore: ["**/node_modules/**", "**/*.d.ts"],
  });

  const analyses: TestFileAnalysis[] = [];

  for (const file of testFiles) {
    try {
      const analysis = analyzeTestFile(file);
      analyses.push(analysis);
    } catch (error) {
      console.warn(`⚠️  Could not analyze ${file}: ${error}`);
    }
  }

  // Generate report
  console.log("📊 Migration Analysis Report");
  console.log("============================\n");

  let totalIssues = 0;
  for (const analysis of analyses) {
    if (analysis.recommendations.length > 0) {
      console.log(`📄 ${analysis.filePath}`);
      console.log(`   Issues found: ${analysis.recommendations.length}`);

      if (analysis.hasPayloadOperations)
        console.log("   ⚠️  Uses Payload operations");
      if (analysis.hasDatabaseAccess)
        console.log("   ⚠️  Accesses database directly");
      if (analysis.hasSharedState) console.log("   ⚠️  Uses shared state");
      if (analysis.hasFileOperations)
        console.log("   ⚠️  Performs file operations");
      if (analysis.hasHardcodedData)
        console.log("   ⚠️  Contains hardcoded test data");

      console.log("   📝 Recommendations:");
      for (const rec of analysis.recommendations) {
        console.log(`      • ${rec}`);
      }
      console.log("");

      totalIssues += analysis.recommendations.length;
    }
  }

  // Summary
  console.log("📈 Summary");
  console.log("==========");
  console.log(`Total test files analyzed: ${analyses.length}`);
  console.log(
    `Files needing updates: ${analyses.filter((a) => a.recommendations.length > 0).length}`,
  );
  console.log(`Total issues found: ${totalIssues}\n`);

  // Migration steps
  console.log("🛠️  Migration Steps");
  console.log("==================");
  console.log("1. Review the analysis above");
  console.log("2. For each test file with issues:");
  console.log('   a. Import { setupIsolatedTest } from "../setup-isolated"');
  console.log("   b. Add setupIsolatedTest() call in beforeEach/beforeAll");
  console.log("   c. Replace hardcoded values with dynamic ones");
  console.log("   d. Use the isolated SeedManager for data operations");
  console.log("3. Test your changes with: npm run test:parallel");
  console.log(
    "4. Check the parallel testing guide: __tests__/PARALLEL_TESTING.md\n",
  );

  console.log("✅ Analysis complete! Ready to migrate to parallel testing.");
}

if (require.main === module) {
  generateMigrationReport();
}
