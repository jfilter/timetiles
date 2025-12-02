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

interface RenameEditorProps {
  from: string;
  to: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const RenameEditor = ({ from, to, sourceColumns, onChange }: Readonly<RenameEditorProps>) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor="from">Source Field</Label>
      <Select value={from} onValueChange={(value) => onChange({ from: value })}>
        <SelectTrigger id="from">
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
    <div className="space-y-2">
      <Label htmlFor="to">New Name</Label>
      <Input id="to" value={to} onChange={(e) => onChange({ to: e.target.value })} placeholder="Enter new name" />
    </div>
  </div>
);

interface DateParseEditorProps {
  from: string;
  inputFormat: string;
  outputFormat: string;
  timezone?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const DateParseEditor = ({
  from,
  inputFormat,
  outputFormat,
  timezone,
  sourceColumns,
  onChange,
}: Readonly<DateParseEditorProps>) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor="from">Source Field</Label>
      <Select value={from} onValueChange={(value) => onChange({ from: value })}>
        <SelectTrigger id="from">
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
    <div className="space-y-2">
      <Label htmlFor="inputFormat">Input Format</Label>
      <Select value={inputFormat} onValueChange={(value) => onChange({ inputFormat: value })}>
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
      <Select value={outputFormat} onValueChange={(value) => onChange({ outputFormat: value })}>
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
        onChange={(e) => onChange({ timezone: e.target.value || undefined })}
        placeholder="e.g., America/New_York"
      />
    </div>
  </div>
);

interface StringOpEditorProps {
  from: string;
  operation: "uppercase" | "lowercase" | "trim" | "replace";
  pattern?: string;
  replacement?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const StringOpEditor = ({
  from,
  operation,
  pattern,
  replacement,
  sourceColumns,
  onChange,
}: Readonly<StringOpEditorProps>) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="from">Source Field</Label>
        <Select value={from} onValueChange={(value) => onChange({ from: value })}>
          <SelectTrigger id="from">
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
      <div className="space-y-2">
        <Label htmlFor="operation">Operation</Label>
        <Select value={operation} onValueChange={(value) => onChange({ operation: value as typeof operation })}>
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
          <Input
            id="pattern"
            value={pattern ?? ""}
            onChange={(e) => onChange({ pattern: e.target.value })}
            placeholder="Text to find"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="replacement">Replace With</Label>
          <Input
            id="replacement"
            value={replacement ?? ""}
            onChange={(e) => onChange({ replacement: e.target.value })}
            placeholder="Replacement text"
          />
        </div>
      </div>
    )}
  </div>
);

interface ConcatenateEditorProps {
  fromFields: string[];
  separator: string;
  to: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const ConcatenateEditor = ({
  fromFields,
  separator,
  to,
  sourceColumns,
  onChange,
}: Readonly<ConcatenateEditorProps>) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <Label>Source Fields (select multiple)</Label>
      <div className="flex flex-wrap gap-2">
        {sourceColumns.map((col) => {
          const isSelected = fromFields.includes(col);
          return (
            <button
              key={col}
              type="button"
              onClick={() => {
                const newFields = isSelected ? fromFields.filter((f) => f !== col) : [...fromFields, col];
                onChange({ fromFields: newFields });
              }}
              className={`rounded-md border px-2 py-1 text-sm transition-colors ${
                isSelected
                  ? "border-cartographic-forest bg-cartographic-forest/10 text-cartographic-forest"
                  : "border-border text-muted-foreground hover:border-cartographic-forest/50"
              }`}
            >
              {col}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">Selected: {fromFields.join(", ") || "None"}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="separator">Separator</Label>
        <Input
          id="separator"
          value={separator}
          onChange={(e) => onChange({ separator: e.target.value })}
          placeholder="e.g., ' ' or ', '"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="to">Target Field Name</Label>
        <Input
          id="to"
          value={to}
          onChange={(e) => onChange({ to: e.target.value })}
          placeholder="Name for combined field"
        />
      </div>
    </div>
  </div>
);

interface SplitEditorProps {
  from: string;
  delimiter: string;
  toFields: string[];
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const SplitEditor = ({ from, delimiter, toFields, sourceColumns, onChange }: Readonly<SplitEditorProps>) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="from">Source Field</Label>
        <Select value={from} onValueChange={(value) => onChange({ from: value })}>
          <SelectTrigger id="from">
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
      <div className="space-y-2">
        <Label htmlFor="delimiter">Delimiter</Label>
        <Input
          id="delimiter"
          value={delimiter}
          onChange={(e) => onChange({ delimiter: e.target.value })}
          placeholder="e.g., ',' or ' '"
        />
      </div>
    </div>
    <div className="space-y-2">
      <Label htmlFor="toFields">Target Field Names (comma-separated)</Label>
      <Input
        id="toFields"
        value={toFields.join(", ")}
        onChange={(e) =>
          onChange({
            toFields: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder="e.g., first_name, last_name"
      />
      <p className="text-muted-foreground text-xs">Enter names for each field after splitting</p>
    </div>
  </div>
);

interface TypeCastEditorProps {
  from: string;
  fromType: CastableType;
  toType: CastableType;
  strategy: CastStrategy;
  customFunction?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<ImportTransform>) => void;
}

const TypeCastEditor = ({
  from,
  fromType,
  toType,
  strategy,
  customFunction,
  sourceColumns,
  onChange,
}: Readonly<TypeCastEditorProps>) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="from">Source Field</Label>
        <Select value={from} onValueChange={(value) => onChange({ from: value })}>
          <SelectTrigger id="from">
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
      <div className="space-y-2">
        <Label htmlFor="strategy">Conversion Strategy</Label>
        <Select value={strategy} onValueChange={(value) => onChange({ strategy: value as CastStrategy })}>
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
        <Select value={fromType} onValueChange={(value) => onChange({ fromType: value as CastableType })}>
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
        <Select value={toType} onValueChange={(value) => onChange({ toType: value as CastableType })}>
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
          onChange={(e) => onChange({ customFunction: e.target.value || undefined })}
          placeholder="return value.toString();"
        />
        <p className="text-muted-foreground text-xs">JavaScript code: (value, context) =&gt; transformedValue</p>
      </div>
    )}
  </div>
);
