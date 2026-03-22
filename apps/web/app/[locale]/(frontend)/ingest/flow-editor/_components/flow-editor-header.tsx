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
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { SheetInfo } from "@/lib/types/ingest-wizard";

interface FlowEditorHeaderProps {
  sheetInfo: SheetInfo | null;
  onSave: () => void;
}

export const FlowEditorHeader = ({ sheetInfo, onSave }: Readonly<FlowEditorHeaderProps>) => {
  const t = useTranslations("Ingest");

  return (
    <div className="border-border bg-background flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/ingest">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("flowBackToWizard")}
          </Link>
        </Button>
        <div>
          <h1 className="font-serif text-lg font-semibold">{t("flowVisualFieldMapping")}</h1>
          {sheetInfo && (
            <p className="text-muted-foreground text-sm">
              {t("flowSheetInfo", { name: sheetInfo.name, count: sheetInfo.headers.length })}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          <Undo2 className="mr-2 h-4 w-4" />
          {t("flowUndo")}
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Redo2 className="mr-2 h-4 w-4" />
          {t("flowRedo")}
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          {t("flowApplyAndReturn")}
        </Button>
      </div>
    </div>
  );
};
