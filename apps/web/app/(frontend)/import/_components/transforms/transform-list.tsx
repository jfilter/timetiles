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
import {
  ArrowLeftRight,
  Calendar,
  CaseSensitive,
  type LucideIcon,
  Plus,
  RefreshCw,
  Scissors,
  Trash2,
  Type,
} from "lucide-react";
import { useCallback, useState } from "react";

import {
  createTransform,
  type ImportTransform,
  isTransformValid,
  TRANSFORM_TYPE_LABELS,
  type TransformType,
} from "@/lib/types/import-transforms";

import { TransformEditor } from "./transform-editor";

interface TransformListProps {
  transforms: ImportTransform[];
  onTransformsChange: (transforms: ImportTransform[]) => void;
  sourceColumns: string[];
}

const TRANSFORM_ICONS: Record<TransformType, LucideIcon> = {
  rename: Type,
  "date-parse": Calendar,
  "string-op": CaseSensitive,
  concatenate: ArrowLeftRight,
  split: Scissors,
  "type-cast": RefreshCw,
};

const TRANSFORM_COLORS: Record<TransformType, string> = {
  rename: "text-cartographic-blue",
  "date-parse": "text-cartographic-terracotta",
  "string-op": "text-cartographic-forest",
  concatenate: "text-cartographic-navy",
  split: "text-purple-600",
  "type-cast": "text-amber-600",
};

export const TransformList = ({ transforms, onTransformsChange, sourceColumns }: Readonly<TransformListProps>) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  const addTransform = useCallback(
    (type: TransformType) => {
      const newTransform = createTransform(type);
      onTransformsChange([...transforms, newTransform]);
      setEditingId(newTransform.id);
    },
    [transforms, onTransformsChange]
  );

  const updateTransform = useCallback(
    (id: string, updates: Partial<ImportTransform>) => {
      onTransformsChange(transforms.map((t) => (t.id === id ? ({ ...t, ...updates } as ImportTransform) : t)));
    },
    [transforms, onTransformsChange]
  );

  const deleteTransform = useCallback(
    (id: string) => {
      onTransformsChange(transforms.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [transforms, onTransformsChange, editingId]
  );

  const toggleActive = useCallback(
    (id: string) => {
      onTransformsChange(transforms.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
    },
    [transforms, onTransformsChange]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif text-lg">Data Transforms</CardTitle>
            <CardDescription>Transform source data before mapping to target fields</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Transform
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(Object.keys(TRANSFORM_TYPE_LABELS) as TransformType[]).map((type) => {
                const Icon = TRANSFORM_ICONS[type];
                return (
                  <DropdownMenuItem key={type} onClick={() => addTransform(type)}>
                    <Icon className={cn("mr-2 h-4 w-4", TRANSFORM_COLORS[type])} />
                    {TRANSFORM_TYPE_LABELS[type]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {transforms.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No transforms configured. Add a transform to process your data.
          </div>
        ) : (
          transforms.map((transform) => {
            const Icon = TRANSFORM_ICONS[transform.type];
            const isValid = isTransformValid(transform);
            const isEditing = editingId === transform.id;

            return (
              <div
                key={transform.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  !transform.active && "opacity-50",
                  isEditing && "ring-cartographic-blue ring-2"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="flex flex-1 items-start gap-3 text-left"
                    onClick={() => setEditingId(isEditing ? null : transform.id)}
                  >
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TRANSFORM_COLORS[transform.type])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{TRANSFORM_TYPE_LABELS[transform.type]}</span>
                        {!isValid && (
                          <span className="bg-cartographic-terracotta/10 text-cartographic-terracotta rounded px-1.5 py-0.5 text-[10px] font-medium">
                            Incomplete
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
                      onClick={() => toggleActive(transform.id)}
                      title={transform.active ? "Disable" : "Enable"}
                    >
                      <span
                        className={cn("h-2 w-2 rounded-full", transform.active ? "bg-cartographic-forest" : "bg-muted")}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      onClick={() => deleteTransform(transform.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-3 border-t pt-3">
                    <TransformEditor
                      transform={transform}
                      onChange={(updates) => updateTransform(transform.id, updates)}
                      sourceColumns={sourceColumns}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Display a summary of the transform configuration
 */
const TransformSummary = ({ transform }: { transform: ImportTransform }) => {
  let summary = "";

  switch (transform.type) {
    case "rename":
      summary = transform.from && transform.to ? `${transform.from} → ${transform.to}` : "Select field to rename";
      break;
    case "date-parse":
      summary =
        transform.inputFormat && transform.outputFormat
          ? `${transform.inputFormat} → ${transform.outputFormat}`
          : "Configure date format";
      break;
    case "string-op":
      summary = transform.from ? `Apply ${transform.operation} to ${transform.from}` : "Select field and operation";
      break;
    case "concatenate":
      summary =
        transform.fromFields.length >= 2
          ? `Join ${transform.fromFields.length} fields → ${transform.to || "?"}`
          : "Select fields to concatenate";
      break;
    case "split":
      summary =
        transform.from && transform.toFields.length > 0
          ? `Split ${transform.from} into ${transform.toFields.length} fields`
          : "Configure split operation";
      break;
    case "type-cast":
      summary =
        transform.from && transform.fromType && transform.toType
          ? `${transform.from}: ${transform.fromType} → ${transform.toType}`
          : "Configure type conversion";
      break;
  }

  return <p className="text-muted-foreground mt-0.5 truncate text-sm">{summary}</p>;
};
