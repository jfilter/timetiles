/**
 * Editor component for individual transforms.
 *
 * Renders the appropriate form fields based on the transform type.
 *
 * @module
 * @category Components
 */
"use client";

import { Input } from "@timetiles/ui/components/input";
import { Label } from "@timetiles/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { memo, useCallback } from "react";

import {
  CAST_STRATEGY_LABELS,
  CASTABLE_TYPE_LABELS,
  type CastableType,
  type CastStrategy,
  DATE_FORMAT_OPTIONS,
  type ImportTransform,
} from "@/lib/types/import-transforms";

interface TransformEditorProps {
  transform: ImportTransform;
  onChange: (updates: Partial<ImportTransform>) => void;
  sourceColumns: string[];
}

export const TransformEditor = ({ transform, onChange, sourceColumns }: Readonly<TransformEditorProps>) => {
  switch (transform.type) {
    case "rename":
      return <RenameEditor from={transform.from} to={transform.to} sourceColumns={sourceColumns} onChange={onChange} />;
    case "date-parse":
      return (
        <DateParseEditor
          from={transform.from}
          inputFormat={transform.inputFormat}
          outputFormat={transform.outputFormat}
          timezone={transform.timezone}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    case "string-op":
      return (
        <StringOpEditor
          from={transform.from}
          operation={transform.operation}
          pattern={transform.pattern}
          replacement={transform.replacement}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    case "concatenate":
      return (
        <ConcatenateEditor
          fromFields={transform.fromFields}
          separator={transform.separator}
          to={transform.to}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    case "split":
      return (
        <SplitEditor
          from={transform.from}
          delimiter={transform.delimiter}
          toFields={transform.toFields}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    case "type-cast":
      return (
        <TypeCastEditor
          from={transform.from}
          fromType={transform.fromType}
          toType={transform.toType}
          strategy={transform.strategy}
          customFunction={transform.customFunction}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    default:
      return <div className="text-muted-foreground text-sm">Unknown transform type</div>;
  }
};

// Shared column select component to reduce repetition
interface ColumnSelectProps {
  id: string;
  label: string;
  value: string;
  sourceColumns: string[];
  onValueChange: (value: string) => void;
}

const ColumnSelect = ({ id, label, value, sourceColumns, onValueChange }: Readonly<ColumnSelectProps>) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select field" />
      </SelectTrigger>
      <SelectContent>
        {sourceColumns.map((col) => (
          <SelectItem key={col} value={col}>
            {col}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

interface RenameEditorProps {
  from: string;
  to: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const RenameEditor = memo(({ from, to, sourceColumns, onChange }: Readonly<RenameEditorProps>) => {
  const handleFromChange = useCallback((value: string) => onChange({ from: value }), [onChange]);
  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value }),
    [onChange]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ColumnSelect
        id="from"
        label="Source Field"
        value={from}
        sourceColumns={sourceColumns}
        onValueChange={handleFromChange}
      />
      <div className="space-y-2">
        <Label htmlFor="to">New Name</Label>
        <Input id="to" value={to} onChange={handleToChange} placeholder="Enter new name" />
      </div>
    </div>
  );
});
RenameEditor.displayName = "RenameEditor";

interface DateParseEditorProps {
  from: string;
  inputFormat: string;
  outputFormat: string;
  timezone?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const DateParseEditor = memo(
  ({ from, inputFormat, outputFormat, timezone, sourceColumns, onChange }: Readonly<DateParseEditorProps>) => {
    const handleFromChange = useCallback((value: string) => onChange({ from: value }), [onChange]);
    const handleInputFormatChange = useCallback((value: string) => onChange({ inputFormat: value }), [onChange]);
    const handleOutputFormatChange = useCallback((value: string) => onChange({ outputFormat: value }), [onChange]);
    const handleTimezoneChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => onChange({ timezone: e.target.value || undefined }),
      [onChange]
    );

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="from"
          label="Source Field"
          value={from}
          sourceColumns={sourceColumns}
          onValueChange={handleFromChange}
        />
        <div className="space-y-2">
          <Label htmlFor="inputFormat">Input Format</Label>
          <Select value={inputFormat} onValueChange={handleInputFormatChange}>
            <SelectTrigger id="inputFormat">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="outputFormat">Output Format</Label>
          <Select value={outputFormat} onValueChange={handleOutputFormatChange}>
            <SelectTrigger id="outputFormat">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone (optional)</Label>
          <Input
            id="timezone"
            value={timezone ?? ""}
            onChange={handleTimezoneChange}
            placeholder="e.g., America/New_York"
          />
        </div>
      </div>
    );
  }
);
DateParseEditor.displayName = "DateParseEditor";

interface StringOpEditorProps {
  from: string;
  operation: "uppercase" | "lowercase" | "trim" | "replace";
  pattern?: string;
  replacement?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const StringOpEditor = memo(
  ({ from, operation, pattern, replacement, sourceColumns, onChange }: Readonly<StringOpEditorProps>) => {
    const handleFromChange = useCallback((value: string) => onChange({ from: value }), [onChange]);
    const handleOperationChange = useCallback(
      (value: string) => onChange({ operation: value as typeof operation }),
      [onChange]
    );
    const handlePatternChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => onChange({ pattern: e.target.value }),
      [onChange]
    );
    const handleReplacementChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => onChange({ replacement: e.target.value }),
      [onChange]
    );

    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColumnSelect
            id="from"
            label="Source Field"
            value={from}
            sourceColumns={sourceColumns}
            onValueChange={handleFromChange}
          />
          <div className="space-y-2">
            <Label htmlFor="operation">Operation</Label>
            <Select value={operation} onValueChange={handleOperationChange}>
              <SelectTrigger id="operation">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uppercase">Uppercase</SelectItem>
                <SelectItem value="lowercase">Lowercase</SelectItem>
                <SelectItem value="trim">Trim Whitespace</SelectItem>
                <SelectItem value="replace">Replace</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {operation === "replace" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pattern">Find Pattern</Label>
              <Input id="pattern" value={pattern ?? ""} onChange={handlePatternChange} placeholder="Text to find" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="replacement">Replace With</Label>
              <Input
                id="replacement"
                value={replacement ?? ""}
                onChange={handleReplacementChange}
                placeholder="Replacement text"
              />
            </div>
          </div>
        )}
      </div>
    );
  }
);
StringOpEditor.displayName = "StringOpEditor";

interface FieldToggleButtonProps {
  column: string;
  isSelected: boolean;
  fromFields: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const FieldToggleButton = memo(({ column, isSelected, fromFields, onChange }: Readonly<FieldToggleButtonProps>) => {
  const handleClick = useCallback(() => {
    const newFields = isSelected ? fromFields.filter((f) => f !== column) : [...fromFields, column];
    onChange({ fromFields: newFields });
  }, [isSelected, fromFields, column, onChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded-md border px-2 py-1 text-sm transition-colors ${
        isSelected
          ? "border-cartographic-forest bg-cartographic-forest/10 text-cartographic-forest"
          : "border-border text-muted-foreground hover:border-cartographic-forest/50"
      }`}
    >
      {column}
    </button>
  );
});
FieldToggleButton.displayName = "FieldToggleButton";

interface ConcatenateEditorProps {
  fromFields: string[];
  separator: string;
  to: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const ConcatenateEditor = memo(
  ({ fromFields, separator, to, sourceColumns, onChange }: Readonly<ConcatenateEditorProps>) => {
    const handleSeparatorChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => onChange({ separator: e.target.value }),
      [onChange]
    );
    const handleToChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value }),
      [onChange]
    );

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Source Fields (select multiple)</Label>
          <div className="flex flex-wrap gap-2">
            {sourceColumns.map((col) => (
              <FieldToggleButton
                key={col}
                column={col}
                isSelected={fromFields.includes(col)}
                fromFields={fromFields}
                onChange={onChange}
              />
            ))}
          </div>
          <p className="text-muted-foreground text-xs">Selected: {fromFields.join(", ") || "None"}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="separator">Separator</Label>
            <Input id="separator" value={separator} onChange={handleSeparatorChange} placeholder="e.g., ' ' or ', '" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Target Field Name</Label>
            <Input id="to" value={to} onChange={handleToChange} placeholder="Name for combined field" />
          </div>
        </div>
      </div>
    );
  }
);
ConcatenateEditor.displayName = "ConcatenateEditor";

interface SplitEditorProps {
  from: string;
  delimiter: string;
  toFields: string[];
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const SplitEditor = memo(({ from, delimiter, toFields, sourceColumns, onChange }: Readonly<SplitEditorProps>) => {
  const handleFromChange = useCallback((value: string) => onChange({ from: value }), [onChange]);
  const handleDelimiterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ delimiter: e.target.value }),
    [onChange]
  );
  const handleToFieldsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({
        toFields: e.target.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    [onChange]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="from"
          label="Source Field"
          value={from}
          sourceColumns={sourceColumns}
          onValueChange={handleFromChange}
        />
        <div className="space-y-2">
          <Label htmlFor="delimiter">Delimiter</Label>
          <Input id="delimiter" value={delimiter} onChange={handleDelimiterChange} placeholder="e.g., ',' or ' '" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="toFields">Target Field Names (comma-separated)</Label>
        <Input
          id="toFields"
          value={toFields.join(", ")}
          onChange={handleToFieldsChange}
          placeholder="e.g., first_name, last_name"
        />
        <p className="text-muted-foreground text-xs">Enter names for each field after splitting</p>
      </div>
    </div>
  );
});
SplitEditor.displayName = "SplitEditor";

interface TypeCastEditorProps {
  from: string;
  fromType: CastableType;
  toType: CastableType;
  strategy: CastStrategy;
  customFunction?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const TypeCastEditor = memo(
  ({ from, fromType, toType, strategy, customFunction, sourceColumns, onChange }: Readonly<TypeCastEditorProps>) => {
    const handleFromChange = useCallback((value: string) => onChange({ from: value }), [onChange]);
    const handleStrategyChange = useCallback(
      (value: string) => onChange({ strategy: value as CastStrategy }),
      [onChange]
    );
    const handleFromTypeChange = useCallback(
      (value: string) => onChange({ fromType: value as CastableType }),
      [onChange]
    );
    const handleToTypeChange = useCallback((value: string) => onChange({ toType: value as CastableType }), [onChange]);
    const handleCustomFunctionChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => onChange({ customFunction: e.target.value || undefined }),
      [onChange]
    );

    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColumnSelect
            id="from"
            label="Source Field"
            value={from}
            sourceColumns={sourceColumns}
            onValueChange={handleFromChange}
          />
          <div className="space-y-2">
            <Label htmlFor="strategy">Conversion Strategy</Label>
            <Select value={strategy} onValueChange={handleStrategyChange}>
              <SelectTrigger id="strategy">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CAST_STRATEGY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fromType">From Type</Label>
            <Select value={fromType} onValueChange={handleFromTypeChange}>
              <SelectTrigger id="fromType">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CASTABLE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="toType">To Type</Label>
            <Select value={toType} onValueChange={handleToTypeChange}>
              <SelectTrigger id="toType">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CASTABLE_TYPE_LABELS)
                  .filter(([value]) => value !== "null")
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {strategy === "custom" && (
          <div className="space-y-2">
            <Label htmlFor="customFunction">Custom Function</Label>
            <Input
              id="customFunction"
              value={customFunction ?? ""}
              onChange={handleCustomFunctionChange}
              placeholder="return value.toString();"
            />
            <p className="text-muted-foreground text-xs">JavaScript code: (value, context) =&gt; transformedValue</p>
          </div>
        )}
      </div>
    );
  }
);
TypeCastEditor.displayName = "TypeCastEditor";
