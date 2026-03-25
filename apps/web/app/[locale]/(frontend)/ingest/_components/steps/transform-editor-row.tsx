/**
 * Expanded inline editor row for transforms in the column mapping table.
 *
 * Shown when a user clicks a transform chip to edit its configuration.
 * Wraps the core TransformEditor with save/cancel controls.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui/components/button";
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";

import { TRANSFORM_TYPE_LABELS } from "@/lib/types/ingest-transforms";
import type { IngestTransform } from "@/lib/types/ingest-wizard";

import { TransformEditor } from "../transforms/transform-editor";
import { TRANSFORM_COLORS, TRANSFORM_ICONS } from "./column-mapping-shared";

// ---------------------------------------------------------------------------
// ExpandedEditorRow
// ---------------------------------------------------------------------------

export interface ExpandedEditorRowProps {
  expandedTransform: IngestTransform | null;
  columnName: string;
  sourceColumns: string[];
  onDraftChange: (updates: Partial<IngestTransform>) => void;
  onSave: () => void;
  onCancel: () => void;
  bgClass?: string;
}

export const ExpandedEditorRow = ({
  expandedTransform,
  columnName,
  sourceColumns,
  onDraftChange,
  onSave,
  onCancel,
  bgClass,
}: Readonly<ExpandedEditorRowProps>) => {
  const t = useTranslations("Ingest");

  if (!expandedTransform) return null;

  const Icon = TRANSFORM_ICONS[expandedTransform.type];

  return (
    <tr className={cn("border-primary/5 border-b last:border-0", bgClass)}>
      <td colSpan={4} className="bg-muted/30 px-6 py-4">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2">
            <Icon className={cn("h-4 w-4", TRANSFORM_COLORS[expandedTransform.type])} />
            <span className="text-foreground text-sm font-medium">{TRANSFORM_TYPE_LABELS[expandedTransform.type]}</span>
            <span className="text-muted-foreground text-xs">
              {t("flowSourceColumn")}: {columnName}
            </span>
          </div>
          <TransformEditor transform={expandedTransform} onChange={onDraftChange} sourceColumns={sourceColumns} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              {t("cancelEdit")}
            </Button>
            <Button size="sm" onClick={onSave}>
              {t("saveTransform")}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
};
