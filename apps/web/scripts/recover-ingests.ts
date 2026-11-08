/**
 * Report, and with `apply` resolve, ingest work whose worker died (ADR 0043).
 *
 * Usage: `payload run scripts/recover-ingests.ts [apply]`. Without `apply` it
 * prints what recovery would do and changes nothing but the run history.
 * Invoked by `timetiles ingest recover [--apply]`.
 *
 * @module
 * @category Scripts
 */
import { getPayload } from "payload";

import { closeDatasetLeasePool } from "@/lib/database/dataset-import-lock";
import { runIngestRecovery } from "@/lib/jobs/utils/ingest-recovery";

import config from "../payload.config";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "apply")) {
  console.error("usage: recover-ingests.ts [apply]");
  process.exit(1);
}
const apply = args.includes("apply");

const payload = await getPayload({ config });
try {
  const report = await runIngestRecovery(payload, { apply });
  for (const finding of report.findings) {
    const target = finding.ingestJobId == null ? "-" : `ingest job ${finding.ingestJobId}`;
    const job = finding.payloadJobId == null ? "-" : `payload job ${finding.payloadJobId}`;
    const note = finding.note ? ` (${finding.note})` : "";
    const result = apply ? ` -> ${finding.outcome ?? "?"}${note}` : "";
    console.log(
      `${finding.kind}\t${finding.action}\t${target}\t${job}\t${finding.stage ?? "-"}\tlast seen ${finding.lastSeenAt}${result}`
    );
  }
  const counts = { found: report.findings.length, applied: report.applied, skipped: report.skipped };
  console.log(`found=${counts.found} applied=${counts.applied} skipped=${counts.skipped} mode=${report.mode}`);
  if (!apply && counts.found > 0) console.log("Nothing changed. Run with --apply to resolve these findings.");
} finally {
  await closeDatasetLeasePool();
  await payload.destroy();
}
