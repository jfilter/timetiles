/**
 * Access control rules for import jobs collection.
 *
 * @module
 */
import type { Access } from "payload";

export const importJobsAccess = {
  // Import jobs can be read by the import file owner or admins
  read: (async ({ req }) => {
    const { user, payload } = req;
    if (user?.role === "admin") return true;

    if (!user) return false;

    // Get all import files owned by this user
    const userImportFiles = await payload.find({
      collection: "import-files",
      where: { user: { equals: user.id } },
      limit: 100,
      pagination: false,
      overrideAccess: true,
    });

    const importFileIds = userImportFiles.docs.map((file) => file.id);

    if (importFileIds.length === 0) {
      return false;
    }

    // Return import jobs linked to user's import files
    return {
      importFile: { in: importFileIds },
    };
  }) as Access,

  // Only authenticated users can create import jobs
  create: (({ req: { user } }) => Boolean(user)) as Access,

  // Only import file owner or admins can update
  update: (async ({ req, id }) => {
    const { user } = req;
    if (user?.role === "admin") return true;

    // Security: Check ownership of EXISTING job, not the new data being set
    if (user && id) {
      try {
        const existingJob = await req.payload.findByID({
          collection: "import-jobs",
          id,
          overrideAccess: true,
        });

        if (existingJob?.importFile) {
          const importFileId =
            typeof existingJob.importFile === "object" ? existingJob.importFile.id : existingJob.importFile;
          const importFile = await req.payload.findByID({
            collection: "import-files",
            id: importFileId,
            overrideAccess: true,
          });

          if (importFile?.user) {
            const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;
            return user.id === userId;
          }
        }
      } catch {
        return false;
      }
    }

    return false;
  }) as Access,

  // Only admins can delete
  delete: (({ req: { user } }) => user?.role === "admin") as Access,

  // Only admins can read version history
  readVersions: (({ req: { user } }) => user?.role === "admin") as Access,
};
