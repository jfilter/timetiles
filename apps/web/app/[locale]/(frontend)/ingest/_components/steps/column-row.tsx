/**
 * Individual row component for the column-centric mapping table.
 *
 * Renders source column info, inline transform chips with expandable editors,
 * and a target field assignment dropdown.
 *
 * @module
 * @category Components
 */
"use client";

import { Checkbox, ConfirmDialog } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import type { TransformType } from "@/lib/ingest/types/transforms";
import type { ConfidenceLevel, FieldMappingStringField, IngestTransform } from "@/lib/ingest/types/wizard";

import { TargetSelect } from "./column-mapping-shared";
import { ConfidenceBadge } from "./field-select";
import { AddTransformMenu, TransformChip } from "./transform-chip";
import { ExpandedEditorRow } from "./transform-editor-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnRowProps {
  columnName: string;
  sampleValue: unknown;
  targetField: FieldMappingStringField | null;
  transforms: IngestTransform[];
  isAutoDetected: boolean;
  confidenceLevel: ConfidenceLevel;
  assignedTargets: Set<string>;
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
  onTransformAdd: (columnName: string, type: TransformType) => void;
  onTransformRemove: (columnName: string, transformId: string) => void;
  onTransformUpdate: (columnName: string, transformId: string, updates: Partial<IngestTransform>) => void;
  sourceColumns: string[];
  isSplitParent?: boolean;
  splitChildren?: string[];
  splitChildTransforms?: Record<string, IngestTransform[]>;
  splitChildTargets?: Record<string, FieldMappingStringField | null>;
  geocodingEnabled?: boolean;
  onGeocodingChange?: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatSampleValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value.length > 40 ? `${value.slice(0, 40)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value).slice(0, 40);
};

// ---------------------------------------------------------------------------
// useTransformEditing — shared hook for expand/draft/delete/save/cancel
// ---------------------------------------------------------------------------

const useTransformEditing = (
  columnName: string,
  transforms: IngestTransform[],
  onTransformRemove: (columnName: string, transformId: string) => void,
  onTransformUpdate: (columnName: string, transformId: string, updates: Partial<IngestTransform>) => void
) => {
  const [expandedTransformId, setExpandedTransformId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [draftTransform, setDraftTransform] = useState<IngestTransform | null>(null);

  const handleToggleExpand = useCallback(
    (transformId: string) => {
      if (expandedTransformId === transformId) {
        setExpandedTransformId(null);
        setDraftTransform(null);
      } else {
        setExpandedTransformId(transformId);
        const tf = transforms.find((t) => t.id === transformId);
        if (tf) setDraftTransform({ ...tf } as IngestTransform);
      }
    },
    [expandedTransformId, transforms]
  );

  const handleConfirmRemove = useCallback(() => {
    if (!deleteTargetId) return;
    onTransformRemove(columnName, deleteTargetId);
    if (expandedTransformId === deleteTargetId) {
      setExpandedTransformId(null);
      setDraftTransform(null);
    }
    setDeleteTargetId(null);
  }, [columnName, deleteTargetId, onTransformRemove, expandedTransformId]);

  const handleDraftChange = useCallback((updates: Partial<IngestTransform>) => {
    setDraftTransform((prev) => (prev ? ({ ...prev, ...updates } as IngestTransform) : null));
  }, []);

  const handleSave = useCallback(() => {
    if (!draftTransform || !expandedTransformId) return;
    onTransformUpdate(columnName, expandedTransformId, draftTransform);
    setExpandedTransformId(null);
    setDraftTransform(null);
  }, [columnName, draftTransform, expandedTransformId, onTransformUpdate]);

  const handleCancel = useCallback(() => {
    setExpandedTransformId(null);
    setDraftTransform(null);
  }, []);

  const expandedTransform = draftTransform && expandedTransformId ? draftTransform : null;

  return {
    expandedTransformId,
    expandedTransform,
    deleteTargetId,
    setDeleteTargetId,
    handleToggleExpand,
    handleConfirmRemove,
    handleDraftChange,
    handleSave,
    handleCancel,
  };
};

/** Short label for a transform chip. Re-exported for external consumers. */
export { getTransformChipLabel } from "./transform-chip";

// ---------------------------------------------------------------------------
// SplitChildRow
// ---------------------------------------------------------------------------

interface SplitChildRowProps {
  parentColumn: string;
  childName: string;
  isLast: boolean;
  transforms: IngestTransform[];
  targetField: FieldMappingStringField | null;
  assignedTargets: Set<string>;
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
  onTransformAdd: (columnName: string, type: TransformType) => void;
  onTransformRemove: (columnName: string, transformId: string) => void;
  onTransformUpdate: (columnName: string, transformId: string, updates: Partial<IngestTransform>) => void;
  sourceColumns: string[];
}

/** Transform types available for split child fields (no split or concatenate). */
const CHILD_TRANSFORM_TYPES: TransformType[] = ["rename", "date-parse", "string-op"];

const SplitChildRow = ({
  parentColumn,
  childName,
  isLast,
  transforms,
  targetField,
  assignedTargets,
  onTargetChange,
  onTransformAdd,
  onTransformRemove,
  onTransformUpdate,
  sourceColumns,
}: Readonly<SplitChildRowProps>) => {
  const t = useTranslations("Ingest");
  const editing = useTransformEditing(childName, transforms, onTransformRemove, onTransformUpdate);

  return (
    <>
      <tr
        className="border-primary/5 border-b bg-purple-50/30 last:border-0 dark:bg-purple-950/10"
        data-testid={`split-child-row-${parentColumn}-${childName}`}
      >
        {/* Indented source cell with tree connector */}
        <td className="px-4 py-2 pl-10">
          <div className="flex items-center gap-2">
            <span className="text-primary/40 text-xs" aria-hidden="true">
              {isLast ? "\u2514\u2500" : "\u251C\u2500"}
            </span>
            <span className="text-foreground font-mono text-sm">{childName}</span>
          </div>
        </td>

        {/* Transform chain cell */}
        <td className="px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {transforms.length > 0 ? (
              <>
                {transforms.map((transform) => (
                  <TransformChip
                    key={transform.id}
                    transform={transform}
                    isExpanded={editing.expandedTransformId === transform.id}
                    onToggle={() => editing.handleToggleExpand(transform.id)}
                    onRemove={() => editing.setDeleteTargetId(transform.id)}
                  />
                ))}
                <span className="text-primary/30 mx-0.5 text-xs" aria-hidden="true">
                  &rarr;
                </span>
              </>
            ) : (
              <span className="text-primary/20 mr-2 text-xs" aria-hidden="true">
                &mdash;&mdash;&rarr;
              </span>
            )}
            <AddTransformMenu columnName={childName} onAdd={onTransformAdd} types={CHILD_TRANSFORM_TYPES} />
          </div>
        </td>

        {/* Target field cell */}
        <td className="px-4 py-2">
          <TargetSelect
            columnName={childName}
            targetField={targetField}
            assignedTargets={assignedTargets}
            onTargetChange={onTargetChange}
          />
        </td>

        {/* Spacer cell */}
        <td className="px-4 py-2" />
      </tr>

      {/* Expanded transform editor row for split child */}
      <ExpandedEditorRow
        expandedTransform={editing.expandedTransform}
        columnName={childName}
        sourceColumns={sourceColumns}
        onDraftChange={editing.handleDraftChange}
        onSave={editing.handleSave}
        onCancel={editing.handleCancel}
        bgClass="bg-purple-50/20 dark:bg-purple-950/5"
      />

      <ConfirmDialog
        open={!!editing.deleteTargetId}
        onOpenChange={(open) => !open && editing.setDeleteTargetId(null)}
        title={t("confirmDeleteTransform")}
        description={t("confirmDeleteTransformDescription")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancelEdit")}
        variant="destructive"
        onConfirm={editing.handleConfirmRemove}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// ColumnRow
// ---------------------------------------------------------------------------

export const ColumnRow = ({
  columnName,
  sampleValue,
  targetField,
  transforms,
  isAutoDetected,
  confidenceLevel,
  assignedTargets,
  onTargetChange,
  onTransformAdd,
  onTransformRemove,
  onTransformUpdate,
  sourceColumns,
  isSplitParent,
  splitChildren,
  splitChildTransforms,
  splitChildTargets,
  geocodingEnabled,
  onGeocodingChange,
}: Readonly<ColumnRowProps>) => {
  const t = useTranslations("Ingest");
  const editing = useTransformEditing(columnName, transforms, onTransformRemove, onTransformUpdate);

  return (
    <>
      <tr
        className={cn("border-primary/5 border-b last:border-0", targetField && "bg-accent/[0.02]")}
        data-testid={`column-row-${columnName}`}
      >
        {/* Source column cell */}
        <td className="px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-mono text-sm font-medium">{columnName}</span>
              {isAutoDetected && <ConfidenceBadge level={confidenceLevel} />}
            </div>
            <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">{formatSampleValue(sampleValue)}</p>
          </div>
        </td>

        {/* Transforms cell */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {transforms.length > 0 ? (
              <>
                {transforms.map((transform) => (
                  <TransformChip
                    key={transform.id}
                    transform={transform}
                    isExpanded={editing.expandedTransformId === transform.id}
                    onToggle={() => editing.handleToggleExpand(transform.id)}
                    onRemove={() => editing.setDeleteTargetId(transform.id)}
                  />
                ))}
                {/* Arrow indicator when transforms exist */}
                <span className="text-primary/30 mx-0.5 text-xs" aria-hidden="true">
                  &rarr;
                </span>
              </>
            ) : (
              <span className="text-primary/20 mr-2 text-xs" aria-hidden="true">
                &mdash;&mdash;&rarr;
              </span>
            )}
            <AddTransformMenu columnName={columnName} onAdd={onTransformAdd} />
          </div>
        </td>

        {/* Target field cell */}
        <td className="px-4 py-3">
          <TargetSelect
            columnName={columnName}
            targetField={targetField}
            assignedTargets={assignedTargets}
            onTargetChange={onTargetChange}
          />
          {(targetField === "locationField" || targetField === "locationNameField") && onGeocodingChange && (
            <label className="mt-2 flex items-center gap-2 text-xs">
              <Checkbox
                checked={geocodingEnabled}
                onCheckedChange={(checked) => onGeocodingChange(checked === true)}
                className="h-3.5 w-3.5"
              />
              <span className="text-muted-foreground">{t("enableGeocoding")}</span>
            </label>
          )}
        </td>

        {/* Spacer cell for visual balance */}
        <td className="px-4 py-3" />
      </tr>

      {/* Expanded transform editor row */}
      <ExpandedEditorRow
        expandedTransform={editing.expandedTransform}
        columnName={columnName}
        sourceColumns={sourceColumns}
        onDraftChange={editing.handleDraftChange}
        onSave={editing.handleSave}
        onCancel={editing.handleCancel}
      />

      <ConfirmDialog
        open={!!editing.deleteTargetId}
        onOpenChange={(open) => !open && editing.setDeleteTargetId(null)}
        title={t("confirmDeleteTransform")}
        description={t("confirmDeleteTransformDescription")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancelEdit")}
        variant="destructive"
        onConfirm={editing.handleConfirmRemove}
      />

      {/* Split child rows — interactive with transforms + target assignment */}
      {isSplitParent &&
        splitChildren?.map((childName, i) => (
          <SplitChildRow
            key={`${columnName}-split-${childName}`}
            parentColumn={columnName}
            childName={childName}
            isLast={i === splitChildren.length - 1}
            transforms={splitChildTransforms?.[childName] ?? []}
            targetField={splitChildTargets?.[childName] ?? null}
            assignedTargets={assignedTargets}
            onTargetChange={onTargetChange}
            onTransformAdd={onTransformAdd}
            onTransformRemove={onTransformRemove}
            onTransformUpdate={onTransformUpdate}
            sourceColumns={sourceColumns}
          />
        ))}
    </>
  );
};
