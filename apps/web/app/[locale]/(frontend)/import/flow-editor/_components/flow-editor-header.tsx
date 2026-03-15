/**
 * Header component for the flow editor.
 *
 * Contains navigation, title, and action buttons.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui/components/button";
import { ArrowLeft, Redo2, Save, Undo2 } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { SheetInfo } from "@/lib/types/import-wizard";

interface FlowEditorHeaderProps {
  sheetInfo: SheetInfo | null;
  onSave: () => void;
}

export const FlowEditorHeader = ({ sheetInfo, onSave }: Readonly<FlowEditorHeaderProps>) => {
  return (
    <div className="border-border bg-background flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/import?step=4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Wizard
          </Link>
        </Button>
        <div>
          <h1 className="font-serif text-lg font-semibold">Visual Field Mapping</h1>
          {sheetInfo && (
            <p className="text-muted-foreground text-sm">
              {sheetInfo.name} • {sheetInfo.headers.length} columns
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          <Undo2 className="mr-2 h-4 w-4" />
          Undo
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Redo2 className="mr-2 h-4 w-4" />
          Redo
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          Apply & Return
        </Button>
      </div>
    </div>
  );
};
