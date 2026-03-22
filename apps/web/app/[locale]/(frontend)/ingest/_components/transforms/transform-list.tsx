/**
 * Traditional form-based transform configuration UI.
 *
 * Provides an alternative to the visual flow editor for configuring
 * data transforms. Displays a list of transforms with inline editing.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@timetiles/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@timetiles/ui/components/dropdown-menu";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeftRight, Calendar, CaseSensitive, type LucideIcon, Plus, Scissors, Trash2, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  createTransform,
  type IngestTransform,
  isTransformValid,
  TRANSFORM_TYPE_LABELS,
  type TransformType,
} from "@/lib/types/ingest-transforms";

import { TransformEditor } from "./transform-editor";

interface TransformListProps {
  transforms: IngestTransform[];
  onTransformsChange: (transforms: IngestTransform[]) => void;
  sourceColumns: string[];
}

const TRANSFORM_ICONS: Record<TransformType, LucideIcon> = {
  rename: Type,
  "date-parse": Calendar,
  "string-op": CaseSensitive,
  concatenate: ArrowLeftRight,
  split: Scissors,
};

const TRANSFORM_COLORS: Record<TransformType, string> = {
  rename: "text-cartographic-blue",
  "date-parse": "text-cartographic-terracotta",
  "string-op": "text-cartographic-forest",
  concatenate: "text-cartographic-navy",
  split: "text-purple-600",
};

// Separate component for dropdown menu items
interface AddTransformMenuItemProps {
  type: TransformType;
  onAdd: (type: TransformType) => void;
}

const AddTransformMenuItem = ({ type, onAdd }: Readonly<AddTransformMenuItemProps>) => {
  const Icon = TRANSFORM_ICONS[type];
  const handleClick = () => onAdd(type);

  return (
    <DropdownMenuItem onClick={handleClick}>
      <Icon className={cn("mr-2 h-4 w-4", TRANSFORM_COLORS[type])} />
      {TRANSFORM_TYPE_LABELS[type]}
    </DropdownMenuItem>
  );
};

// Separate component for each transform item
interface TransformItemProps {
  transform: IngestTransform;
  isEditing: boolean;
  sourceColumns: string[];
  onToggleEdit: (id: string | null) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<IngestTransform>) => void;
}

const TransformItem = ({
  transform,
  isEditing,
  sourceColumns,
  onToggleEdit,
  onToggleActive,
  onDelete,
  onUpdate,
}: Readonly<TransformItemProps>) => {
  const t = useTranslations("Ingest");
  const Icon = TRANSFORM_ICONS[transform.type];
  const isValid = isTransformValid(transform);

  const handleEditClick = () => {
    onToggleEdit(isEditing ? null : transform.id);
  };

  const handleToggleActive = () => {
    onToggleActive(transform.id);
  };

  const handleDelete = () => {
    onDelete(transform.id);
  };

  const handleUpdate = (updates: Partial<IngestTransform>) => {
    onUpdate(transform.id, updates);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        !transform.active && "opacity-50",
        isEditing && "ring-cartographic-blue ring-2"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="flex flex-1 items-start gap-3 text-left" onClick={handleEditClick}>
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TRANSFORM_COLORS[transform.type])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium">{TRANSFORM_TYPE_LABELS[transform.type]}</span>
              {!isValid && (
                <span className="bg-cartographic-terracotta/10 text-cartographic-terracotta rounded px-1.5 py-0.5 text-[10px] font-medium">
                  {t("tfIncomplete")}
                </span>
              )}
            </div>
            <TransformSummary transform={transform} />
          </div>
        </button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleToggleActive}
            title={transform.active ? t("tfDisable") : t("tfEnable")}
          >
            <span className={cn("h-2 w-2 rounded-full", transform.active ? "bg-cartographic-forest" : "bg-muted")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 border-t pt-3">
          <TransformEditor transform={transform} onChange={handleUpdate} sourceColumns={sourceColumns} />
        </div>
      )}
    </div>
  );
};

export const TransformList = ({ transforms, onTransformsChange, sourceColumns }: Readonly<TransformListProps>) => {
  const t = useTranslations("Ingest");
  const [editingId, setEditingId] = useState<string | null>(null);

  const addTransform = (type: TransformType) => {
    const newTransform = createTransform(type);
    onTransformsChange([...transforms, newTransform]);
    setEditingId(newTransform.id);
  };

  const updateTransform = (id: string, updates: Partial<IngestTransform>) => {
    onTransformsChange(transforms.map((t) => (t.id === id ? ({ ...t, ...updates } as IngestTransform) : t)));
  };

  const deleteTransform = (id: string) => {
    onTransformsChange(transforms.filter((t) => t.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const toggleActive = (id: string) => {
    onTransformsChange(transforms.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif text-lg">{t("tfDataTransforms")}</CardTitle>
            <CardDescription>{t("tfDataTransformsDescription")}</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t("tfAddTransform")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(Object.keys(TRANSFORM_TYPE_LABELS) as TransformType[]).map((type) => (
                <AddTransformMenuItem key={type} type={type} onAdd={addTransform} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {transforms.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            {t("tfNoTransforms")}
          </div>
        ) : (
          transforms.map((transform) => (
            <TransformItem
              key={transform.id}
              transform={transform}
              isEditing={editingId === transform.id}
              sourceColumns={sourceColumns}
              onToggleEdit={setEditingId}
              onToggleActive={toggleActive}
              onDelete={deleteTransform}
              onUpdate={updateTransform}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
};

const getTransformSummary = (transform: IngestTransform, t: (...args: any[]) => string): string => {
  switch (transform.type) {
    case "rename":
      return transform.from && transform.to ? `${transform.from} → ${transform.to}` : t("tfSelectFieldToRename");
    case "date-parse":
      return transform.inputFormat && transform.outputFormat
        ? `${transform.inputFormat} → ${transform.outputFormat}`
        : t("tfConfigureDateFormat");
    case "string-op":
      return transform.from
        ? t("tfApplyOpToField", { operation: transform.operation, field: transform.from })
        : t("tfSelectFieldAndOp");
    case "concatenate":
      return transform.fromFields.length >= 2
        ? t("tfJoinFieldsTo", { count: transform.fromFields.length, target: transform.to || "?" })
        : t("tfSelectFieldsToConcat");
    case "split":
      return transform.from && transform.toFields.length > 0
        ? t("tfSplitFieldInto", { field: transform.from, count: transform.toFields.length })
        : t("tfConfigureSplit");
  }
};

const TransformSummary = ({ transform }: { transform: IngestTransform }) => {
  const t = useTranslations("Ingest");
  return <p className="text-muted-foreground mt-0.5 truncate text-sm">{getTransformSummary(transform, t)}</p>;
};
