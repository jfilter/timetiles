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

import { Checkbox } from "@timetiles/ui";
import { Button } from "@timetiles/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@timetiles/ui/components/dropdown-menu";
import { cn } from "@timetiles/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { TRANSFORM_TYPE_LABELS, type TransformType } from "@/lib/types/import-transforms";
import type { ConfidenceLevel, FieldMappingStringField, ImportTransform } from "@/lib/types/import-wizard";

import { TransformEditor } from "../transforms/transform-editor";
import { TargetSelect, TRANSFORM_COLORS, TRANSFORM_ICONS } from "./column-mapping-shared";
import { ConfidenceBadge } from "./field-select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnRowProps {
  columnName: string;
  sampleValue: unknown;
  targetField: FieldMappingStringField | null;
  transforms: ImportTransform[];
  isAutoDetected: boolean;
  confidenceLevel: ConfidenceLevel;
  assignedTargets: Set<string>;
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
  onTransformAdd: (columnName: string, type: TransformType) => void;
  onTransformRemove: (columnName: string, transformId: string) => void;
  onTransformUpdate: (columnName: string, transformId: string, updates: Partial<ImportTransform>) => void;
  sourceColumns: string[];
  isSplitParent?: boolean;
  splitChildren?: string[];
  splitChildTransforms?: Record<string, ImportTransform[]>;
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

/** Short label for a transform chip. */
const getTransformChipLabel = (transform: ImportTransform): string => {
  switch (transform.type) {
    case "rename":
      return transform.to ? `Rename: ${transform.to}` : "Rename";
    case "date-parse":
      return transform.inputFormat ? `Date: ${transform.inputFormat}` : "Parse Date";
    case "string-op":
      return transform.operation.charAt(0).toUpperCase() + transform.operation.slice(1);
    case "concatenate":
      return `Join ${transform.fromFields.length} fields`;
    case "split":
      return `Split -> ${transform.toFields.length}`;
    case "type-cast":
      return transform.toType ? `Cast: ${transform.toType}` : "Convert";
  }
};

// ---------------------------------------------------------------------------
// TransformChip
// ---------------------------------------------------------------------------

interface TransformChipProps {
  transform: ImportTransform;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

const TransformChip = ({ transform, isExpanded, onToggle, onRemove }: Readonly<TransformChipProps>) => {
  const Icon = TRANSFORM_ICONS[transform.type];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs",
        isExpanded
          ? "border-cartographic-navy/30 bg-cartographic-navy/5 ring-cartographic-blue ring-1"
          : "border-cartographic-navy/15 bg-cartographic-cream/30 hover:bg-cartographic-cream/60",
        !transform.active && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1"
        aria-expanded={isExpanded}
        aria-label={TRANSFORM_TYPE_LABELS[transform.type]}
      >
        <Icon className={cn("h-3 w-3", TRANSFORM_COLORS[transform.type])} />
        <span className="text-foreground max-w-[120px] truncate">{getTransformChipLabel(transform)}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive -mr-0.5 ml-0.5 rounded-sm p-0.5"
        aria-label="Remove transform"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
};

// ---------------------------------------------------------------------------
// AddTransformMenu
// ---------------------------------------------------------------------------

interface AddTransformMenuProps {
  columnName: string;
  onAdd: (columnName: string, type: TransformType) => void;
  /** Subset of transform types to offer. Defaults to all except concatenate. */
  types?: TransformType[];
}

const DEFAULT_TRANSFORM_TYPES: TransformType[] = ["rename", "date-parse", "string-op", "split", "type-cast"];

/** Dropdown that adds a new transform to a column. Subset of types via `types` prop. */
const AddTransformMenu = ({ columnName, onAdd, types = DEFAULT_TRANSFORM_TYPES }: Readonly<AddTransformMenuProps>) => {
  const t = useTranslations("Import");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs"
          aria-label={t("addTransformToColumn")}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {types.map((type) => {
          const Icon = TRANSFORM_ICONS[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onAdd(columnName, type)}>
              <Icon className={cn("mr-2 h-4 w-4", TRANSFORM_COLORS[type])} />
              {TRANSFORM_TYPE_LABELS[type]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ---------------------------------------------------------------------------
// SplitChildRow
// ---------------------------------------------------------------------------

interface SplitChildRowProps {
  parentColumn: string;
  childName: string;
  isLast: boolean;
  transforms: ImportTransform[];
  targetField: FieldMappingStringField | null;
  assignedTargets: Set<string>;
  onTargetChange: (columnName: string, target: FieldMappingStringField | null) => void;
  onTransformAdd: (columnName: string, type: TransformType) => void;
  onTransformRemove: (columnName: string, transformId: string) => void;
  onTransformUpdate: (columnName: string, transformId: string, updates: Partial<ImportTransform>) => void;
  sourceColumns: string[];
}

/** Transform types available for split child fields (no split or concatenate). */
const CHILD_TRANSFORM_TYPES: TransformType[] = ["rename", "date-parse", "string-op", "type-cast"];

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
  const t = useTranslations("Import");
  const [expandedTransformId, setExpandedTransformId] = useState<string | null>(null);

  const handleToggleExpand = useCallback((transformId: string) => {
    setExpandedTransformId((prev) => (prev === transformId ? null : transformId));
  }, []);

  const handleRemoveTransform = useCallback(
    (transformId: string) => {
      onTransformRemove(childName, transformId);
      if (expandedTransformId === transformId) {
        setExpandedTransformId(null);
      }
    },
    [childName, onTransformRemove, expandedTransformId]
  );

  const handleUpdateTransform = useCallback(
    (transformId: string, updates: Partial<ImportTransform>) => {
      onTransformUpdate(childName, transformId, updates);
    },
    [childName, onTransformUpdate]
  );

  const expandedTransform = transforms.find((tf) => tf.id === expandedTransformId);

  return (
    <>
      <tr
        className="border-cartographic-navy/5 border-b bg-purple-50/30 last:border-0 dark:bg-purple-950/10"
        data-testid={`split-child-row-${parentColumn}-${childName}`}
      >
        {/* Indented source cell with tree connector */}
        <td className="px-4 py-2 pl-10">
          <div className="flex items-center gap-2">
            <span className="text-cartographic-navy/40 text-xs" aria-hidden="true">
              {isLast ? "\u2514\u2500" : "\u251C\u2500"}
            </span>
            <span className="text-cartographic-charcoal font-mono text-sm">{childName}</span>
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
                    isExpanded={expandedTransformId === transform.id}
                    onToggle={() => handleToggleExpand(transform.id)}
                    onRemove={() => handleRemoveTransform(transform.id)}
                  />
                ))}
                <span className="text-cartographic-navy/30 mx-0.5 text-xs" aria-hidden="true">
                  &rarr;
                </span>
              </>
            ) : (
              <span className="text-cartographic-navy/20 mr-2 text-xs" aria-hidden="true">
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
      {expandedTransform && (
        <tr className="border-cartographic-navy/5 border-b bg-purple-50/20 last:border-0 dark:bg-purple-950/5">
          <td colSpan={4} className="bg-muted/30 px-6 py-4">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2">
                {(() => {
                  const Icon = TRANSFORM_ICONS[expandedTransform.type];
                  return <Icon className={cn("h-4 w-4", TRANSFORM_COLORS[expandedTransform.type])} />;
                })()}
                <span className="text-foreground text-sm font-medium">
                  {TRANSFORM_TYPE_LABELS[expandedTransform.type]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("flowSourceColumn")}: {childName}
                </span>
              </div>
              <TransformEditor
                transform={expandedTransform}
                onChange={(updates) => handleUpdateTransform(expandedTransform.id, updates)}
                sourceColumns={sourceColumns}
              />
            </div>
          </td>
        </tr>
      )}
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
  const t = useTranslations("Import");
  const [expandedTransformId, setExpandedTransformId] = useState<string | null>(null);

  const handleToggleExpand = useCallback((transformId: string) => {
    setExpandedTransformId((prev) => (prev === transformId ? null : transformId));
  }, []);

  const handleRemoveTransform = useCallback(
    (transformId: string) => {
      onTransformRemove(columnName, transformId);
      if (expandedTransformId === transformId) {
        setExpandedTransformId(null);
      }
    },
    [columnName, onTransformRemove, expandedTransformId]
  );

  const handleUpdateTransform = useCallback(
    (transformId: string, updates: Partial<ImportTransform>) => {
      onTransformUpdate(columnName, transformId, updates);
    },
    [columnName, onTransformUpdate]
  );

  const expandedTransform = transforms.find((t) => t.id === expandedTransformId);

  return (
    <>
      <tr
        className={cn(
          "border-cartographic-navy/5 border-b last:border-0",
          targetField && "bg-cartographic-forest/[0.02]"
        )}
        data-testid={`column-row-${columnName}`}
      >
        {/* Source column cell */}
        <td className="px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-cartographic-charcoal font-mono text-sm font-medium">{columnName}</span>
              {isAutoDetected && <ConfidenceBadge level={confidenceLevel} />}
            </div>
            <p className="text-cartographic-navy/50 mt-0.5 truncate font-mono text-xs">
              {formatSampleValue(sampleValue)}
            </p>
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
                    isExpanded={expandedTransformId === transform.id}
                    onToggle={() => handleToggleExpand(transform.id)}
                    onRemove={() => handleRemoveTransform(transform.id)}
                  />
                ))}
                {/* Arrow indicator when transforms exist */}
                <span className="text-cartographic-navy/30 mx-0.5 text-xs" aria-hidden="true">
                  &rarr;
                </span>
              </>
            ) : (
              <span className="text-cartographic-navy/20 mr-2 text-xs" aria-hidden="true">
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
          {targetField === "locationField" && onGeocodingChange && (
            <label className="mt-2 flex items-center gap-2 text-xs">
              <Checkbox
                checked={geocodingEnabled}
                onCheckedChange={(checked) => onGeocodingChange(checked === true)}
                className="h-3.5 w-3.5"
              />
              <span className="text-cartographic-navy/70">{t("enableGeocoding")}</span>
            </label>
          )}
        </td>

        {/* Spacer cell for visual balance */}
        <td className="px-4 py-3" />
      </tr>

      {/* Expanded transform editor row */}
      {expandedTransform && (
        <tr className="border-cartographic-navy/5 border-b last:border-0">
          <td colSpan={4} className="bg-muted/30 px-6 py-4">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2">
                {(() => {
                  const Icon = TRANSFORM_ICONS[expandedTransform.type];
                  return <Icon className={cn("h-4 w-4", TRANSFORM_COLORS[expandedTransform.type])} />;
                })()}
                <span className="text-foreground text-sm font-medium">
                  {TRANSFORM_TYPE_LABELS[expandedTransform.type]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("flowSourceColumn")}: {columnName}
                </span>
              </div>
              <TransformEditor
                transform={expandedTransform}
                onChange={(updates) => handleUpdateTransform(expandedTransform.id, updates)}
                sourceColumns={sourceColumns}
              />
            </div>
          </td>
        </tr>
      )}

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
