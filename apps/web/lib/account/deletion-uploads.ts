/**
 * Removal of a user's uploads (import files and media) during account deletion.
 *
 * Payload's delete unlinks an upload before its row, which a rolled-back deletion could not
 * undo. Rows are therefore deleted through the adapter inside the transaction, files after commit.
 *
 * @module
 * @category Services
 */
import { rm } from "node:fs/promises";
import path from "node:path";

import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { settleDeletedJobsQuota } from "@/lib/ingest/event-quota-ledger";
import { getSidecarPath } from "@/lib/ingest/file-readers";
import { assertNoLiveIngestTask } from "@/lib/ingest/ingest-lease";
import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { findUserDocs } from "@/lib/utils/user-data";

import { logError } from "../logger";
import type { ExecuteDeletionResult } from "./deletion-types";

type TransactionReq = Pick<PayloadRequest, "payload" | "transactionID" | "context">;

type UploadDoc = { filename?: string | null; sizes?: Record<string, { filename?: string | null } | undefined> | null };

/** Stored file and image-size variants of an upload document, resolved inside its static dir. */
const uploadPaths = (payload: Payload, collection: "ingest-files" | "media", doc: UploadDoc): string[] => {
  const staticDir = path.resolve(payload.collections[collection].config.upload.staticDir ?? "");
  const names = [doc.filename, ...Object.values(doc.sizes ?? {}).map((size) => size?.filename)];
  return names.filter((name): name is string => Boolean(name)).map((name) => path.join(staticDir, path.basename(name)));
};

/**
 * Delete the user's import files (with their ingest jobs) and media rows in the transaction.
 *
 * @returns Paths of the stored files to remove once the transaction has committed.
 */
export const deleteUserUploadRows = async (
  payload: Payload,
  userId: number,
  result: ExecuteDeletionResult,
  req: TransactionReq
): Promise<string[]> => {
  const filePaths: string[] = [];

  const importFiles = await findUserDocs(payload, "ingest-files", userId, { userField: "user", trash: true });
  for (const file of importFiles) {
    // Jobs and their versions reference the file through NOT NULL columns; sidecars sit next to it.
    const jobs = await payload.find({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: { ingestFile: { equals: file.id } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      trash: true,
      req,
    });
    await payload.db.deleteVersions({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: { "version.ingestFile": { equals: file.id } },
      req,
    });
    // The adapter delete skips collection hooks, so guard and settle the jobs here.
    await assertNoLiveIngestTask(
      payload,
      jobs.docs.map((job) => job.id),
      req
    );
    await settleDeletedJobsQuota(payload, jobs.docs, req);
    await payload.db.deleteMany({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: { ingestFile: { equals: file.id } },
      req,
    });
    await payload.db.deleteVersions({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: { parent: { equals: file.id } },
      req,
    });
    await payload.db.deleteOne({ collection: COLLECTION_NAMES.INGEST_FILES, where: { id: { equals: file.id } }, req });
    const stored = uploadPaths(payload, "ingest-files", file);
    filePaths.push(...stored, ...stored.flatMap((p) => jobs.docs.map((job) => getSidecarPath(p, job.sheetIndex ?? 0))));
    result.dataDeleted.importFiles++;
  }

  // finalizeAndAudit only anonymizes the user row, and media is publicly readable.
  const mediaDocs = await findUserDocs(payload, "media", userId, { trash: true });
  for (const item of mediaDocs) {
    await payload.db.deleteOne({ collection: "media", where: { id: { equals: item.id } }, req });
    filePaths.push(...uploadPaths(payload, "media", item));
    result.dataDeleted.media++;
  }

  return filePaths;
};

/**
 * Delete the ingest jobs (live and versions) that reference a dataset, whoever owns their file.
 *
 * @returns Sheet sidecar paths of those jobs, to remove once the transaction has committed.
 */
export const deleteDatasetJobRows = async (
  payload: Payload,
  datasetId: number,
  req: TransactionReq
): Promise<string[]> => {
  const jobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { dataset: { equals: datasetId } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    trash: true,
    req,
  });
  await payload.db.deleteVersions({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { "version.dataset": { equals: datasetId } },
    req,
  });
  if (jobs.docs.length === 0) return [];
  // Versions from before a job was moved to this dataset point elsewhere but still belong to it.
  const jobIds = jobs.docs.map((job) => job.id);
  await payload.db.deleteVersions({ collection: COLLECTION_NAMES.INGEST_JOBS, where: { parent: { in: jobIds } }, req });
  await assertNoLiveIngestTask(payload, jobIds, req);
  await settleDeletedJobsQuota(payload, jobs.docs, req);
  await payload.db.deleteMany({ collection: COLLECTION_NAMES.INGEST_JOBS, where: { id: { in: jobIds } }, req });

  const fileIds = [
    ...new Set(jobs.docs.map((job) => (typeof job.ingestFile === "object" ? job.ingestFile.id : job.ingestFile))),
  ];
  const files = await payload.find({
    collection: COLLECTION_NAMES.INGEST_FILES,
    where: { id: { in: fileIds } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    trash: true,
    req,
  });
  const filenames = new Map(files.docs.map((file) => [file.id, file.filename]));
  return jobs.docs.flatMap((job) => {
    const filename = filenames.get(typeof job.ingestFile === "object" ? job.ingestFile.id : job.ingestFile);
    return filename ? [getSidecarPath(getIngestFilePath(filename), job.sheetIndex ?? 0)] : [];
  });
};

/**
 * Remove stored upload files after commit. An import file left behind is collected by the orphan
 * sweep; a media file stays publicly readable by its URL until removed by hand, so failures are logged.
 */
export const removeUploadFiles = async (userId: number, filePaths: string[]): Promise<void> => {
  for (const filePath of filePaths) {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      logError(error, "Failed to remove an upload of a deleted account", { userId, filePath });
    }
  }
};
