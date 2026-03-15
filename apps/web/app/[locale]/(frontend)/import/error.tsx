/**
 * Error boundary for the import wizard.
 *
 * Catches rendering errors in wizard step components so users
 * see a recovery option instead of a blank page.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { useEffect } from "react";

import { Link } from "@/i18n/navigation";
import { logError } from "@/lib/logger";

export default function ImportError({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  useEffect(() => {
    logError(error, "Import wizard crashed");
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <AlertTriangleIcon className="text-destructive mx-auto h-12 w-12" />
        <h2 className="text-cartographic-charcoal font-serif text-xl font-semibold">Something went wrong</h2>
        <p className="text-cartographic-navy/70 text-sm">
          The import wizard encountered an error. Your uploaded data is safe — try again or start over.
        </p>
        <div className="flex justify-center gap-3">
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcwIcon className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/import">Start over</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
