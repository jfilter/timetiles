/**
 * Serves the favicon set generated from the Branding global.
 *
 * The files live in upload storage because `next start` only serves `public/`
 * files present at boot, and `public/` is not persisted across deployments.
 *
 * @module
 * @category API
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { apiRoute, NotFoundError } from "@/lib/api";
import { FAVICON_FILE_NAMES, faviconDir } from "@/lib/constants/favicon-files";
import { isENOENT } from "@/lib/utils/is-enoent";

export const GET = apiRoute({
  auth: "none",
  params: z.object({ file: z.string().refine((file) => FAVICON_FILE_NAMES.includes(file)) }),
  handler: async ({ params }) => {
    try {
      const png = await readFile(join(faviconDir(), params.file));
      return new Response(new Uint8Array(png), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
      });
    } catch (error) {
      if (isENOENT(error)) throw new NotFoundError("Favicon has not been generated");
      throw error;
    }
  },
});
