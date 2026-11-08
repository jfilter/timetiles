/**
 * Hand the sheets of a detected file to the `dispatch-ingest-run` task, which
 * queues one `ingest-process` child per sheet. Source workflows end here; the
 * run's outcome is derived later by `reconcileRun`.
 *
 * @module
 * @category Jobs
 */
import type { RunTaskFunctions } from "payload";

import type { DispatchIngestRunInput } from "../handlers/dispatch-ingest-run-job";
import type { SheetInfo } from "../types/task-outputs";

export const dispatchSheets = async (
  tasks: RunTaskFunctions,
  sheets: SheetInfo[],
  source: Omit<DispatchIngestRunInput, "ingestJobIds">
): Promise<void> => {
  const input: DispatchIngestRunInput = { ...source, ingestJobIds: sheets.map((sheet) => Number(sheet.ingestJobId)) };
  await tasks["dispatch-ingest-run"]("dispatch-sheets", { input });
};
