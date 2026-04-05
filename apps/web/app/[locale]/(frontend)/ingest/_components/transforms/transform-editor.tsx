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
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";
import type React from "react";
import { useState } from "react";

import type { StringOperation } from "@/lib/definitions/transform-registry";
import { DATE_FORMAT_OPTIONS, type IngestTransform } from "@/lib/types/ingest-transforms";

interface TransformEditorProps {
  transform: IngestTransform;
  onChange: (updates: Partial<IngestTransform>) => void;
  sourceColumns: string[];
}

export const TransformEditor = ({ transform, onChange, sourceColumns }: Readonly<TransformEditorProps>) => {
  const t = useTranslations("Ingest");

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
          expression={transform.expression}
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
    case "parse-json-array":
      return (
        <ParseJsonArrayEditor
          from={transform.from}
          to={transform.to}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    case "extract":
      return (
        <ExtractEditor
          from={transform.from}
          to={transform.to}
          pattern={transform.pattern}
          group={transform.group}
          sourceColumns={sourceColumns}
          onChange={onChange}
        />
      );
    default:
      return <div className="text-muted-foreground text-sm">{t("tfUnknownType")}</div>;
  }
};

/** Shared column select. */
const ColumnSelect = ({
  id,
  label,
  value,
  sourceColumns,
  onValueChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  sourceColumns: string[];
  onValueChange: (v: string) => void;
}>) => {
  const t = useTranslations("Ingest");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder={t("tfSelectField")} />
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
};

const RenameEditor = ({
  from,
  to,
  sourceColumns,
  onChange,
}: Readonly<{
  from: string;
  to: string;
  sourceColumns: string[];
  onChange: (u: Partial<IngestTransform>) => void;
}>) => {
  const t = useTranslations("Ingest");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ColumnSelect
        id="from"
        label={t("tfSourceField")}
        value={from}
        sourceColumns={sourceColumns}
        onValueChange={handleFromChange}
      />
      <div className="space-y-2">
        <Label htmlFor="to">{t("tfNewName")}</Label>
        <Input id="to" value={to} onChange={handleToChange} placeholder={t("tfNewNamePlaceholder")} />
      </div>
    </div>
  );
};

interface DateParseEditorProps {
  from: string;
  inputFormat: string;
  outputFormat: string;
  timezone?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<IngestTransform>) => void;
}

const DateParseEditor = ({
  from,
  inputFormat,
  outputFormat,
  timezone,
  sourceColumns,
  onChange,
}: Readonly<DateParseEditorProps>) => {
  const t = useTranslations("Ingest");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleInputFormatChange = (value: string) => onChange({ inputFormat: value });
  const handleOutputFormatChange = (value: string) => onChange({ outputFormat: value });
  const handleTimezoneChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ timezone: e.target.value || undefined });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ColumnSelect
        id="from"
        label={t("tfSourceField")}
        value={from}
        sourceColumns={sourceColumns}
        onValueChange={handleFromChange}
      />
      <div className="space-y-2">
        <Label htmlFor="inputFormat">{t("tfInputFormat")}</Label>
        <Select value={inputFormat} onValueChange={handleInputFormatChange}>
          <SelectTrigger id="inputFormat" className="h-11">
            <SelectValue placeholder={t("tfSelectFormat")} />
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
        <Label htmlFor="outputFormat">{t("tfOutputFormat")}</Label>
        <Select value={outputFormat} onValueChange={handleOutputFormatChange}>
          <SelectTrigger id="outputFormat" className="h-11">
            <SelectValue placeholder={t("tfSelectFormat")} />
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
        <Label htmlFor="timezone">{t("tfTimezone")}</Label>
        <Input
          id="timezone"
          value={timezone ?? ""}
          onChange={handleTimezoneChange}
          placeholder={t("tfTimezonePlaceholder")}
        />
      </div>
    </div>
  );
};

interface StringOpEditorProps {
  from: string;
  operation: StringOperation;
  pattern?: string;
  replacement?: string;
  expression?: string;
  sourceColumns: string[];
  onChange: (updates: Partial<IngestTransform>) => void;
}

const EXPRESSION_PRESETS = [
  { labelKey: "tfPresetToNumber", expression: "toNumber(value)" },
  { labelKey: "tfPresetToBoolean", expression: "parseBool(value)" },
  { labelKey: "tfPresetTrim", expression: "trim(value)" },
  { labelKey: "tfPresetRound", expression: "round(toNumber(value), 2)" },
  { labelKey: "tfPresetIfEmpty", expression: 'ifEmpty(value, "")' },
  { labelKey: "tfPresetUppercase", expression: "upper(value)" },
  { labelKey: "tfPresetLowercase", expression: "lower(value)" },
] as const;

const StringOpEditor = ({
  from,
  operation,
  pattern,
  replacement,
  expression,
  sourceColumns,
  onChange,
}: Readonly<StringOpEditorProps>) => {
  const t = useTranslations("Ingest");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleOperationChange = (value: string) => onChange({ operation: value as StringOpEditorProps["operation"] });
  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ pattern: e.target.value });
  const handleReplacementChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ replacement: e.target.value });
  const handleExpressionChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ expression: e.target.value });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="from"
          label={t("tfSourceField")}
          value={from}
          sourceColumns={sourceColumns}
          onValueChange={handleFromChange}
        />
        <div className="space-y-2">
          <Label htmlFor="operation">{t("tfOperation")}</Label>
          <Select value={operation} onValueChange={handleOperationChange}>
            <SelectTrigger id="operation" className="h-11">
              <SelectValue placeholder={t("tfSelectOperation")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uppercase">{t("tfOpUppercase")}</SelectItem>
              <SelectItem value="lowercase">{t("tfOpLowercase")}</SelectItem>
              <SelectItem value="replace">{t("tfOpReplace")}</SelectItem>
              <SelectItem value="expression">{t("tfOpExpression")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {operation === "replace" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pattern">{t("tfFindPattern")}</Label>
            <Input
              id="pattern"
              value={pattern ?? ""}
              onChange={handlePatternChange}
              placeholder={t("tfFindPatternPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replacement">{t("tfReplaceWith")}</Label>
            <Input
              id="replacement"
              value={replacement ?? ""}
              onChange={handleReplacementChange}
              placeholder={t("tfReplacePlaceholder")}
            />
          </div>
        </div>
      )}
      {operation === "expression" && (
        <div className="space-y-3">
          <Label htmlFor="expression">{t("tfCustomExpression")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {EXPRESSION_PRESETS.map((preset) => (
              <button
                key={preset.expression}
                type="button"
                onClick={() => onChange({ expression: preset.expression })}
                className={cn(
                  "rounded-sm border px-2 py-0.5 text-xs transition-colors",
                  expression === preset.expression
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-primary/15 text-muted-foreground hover:bg-card/60"
                )}
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
          <Input
            id="expression"
            value={expression ?? ""}
            onChange={handleExpressionChange}
            placeholder={t("tfCustomExpressionPlaceholder")}
          />
          <p className="text-muted-foreground text-xs">{t("tfCustomExpressionHint")}</p>
        </div>
      )}
    </div>
  );
};

const FieldToggleButton = ({
  column,
  isSelected,
  fromFields,
  onChange,
}: Readonly<{
  column: string;
  isSelected: boolean;
  fromFields: string[];
  onChange: (u: Partial<IngestTransform>) => void;
}>) => (
  <button
    type="button"
    onClick={() =>
      onChange({ fromFields: isSelected ? fromFields.filter((f) => f !== column) : [...fromFields, column] })
    }
    className={`rounded-md border px-2 py-1 text-sm transition-colors ${
      isSelected
        ? "border-accent bg-accent/10 text-accent"
        : "border-border text-muted-foreground hover:border-accent/50"
    }`}
  >
    {column}
  </button>
);

interface ConcatenateEditorProps {
  fromFields: string[];
  separator: string;
  to: string;
  sourceColumns: string[];
  onChange: (updates: Partial<IngestTransform>) => void;
}

const ConcatenateEditor = ({
  fromFields,
  separator,
  to,
  sourceColumns,
  onChange,
}: Readonly<ConcatenateEditorProps>) => {
  const t = useTranslations("Ingest");
  const handleSeparatorChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ separator: e.target.value });
  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("tfSourceFieldsMultiple")}</Label>
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
        <p className="text-muted-foreground text-xs">
          {t("tfSelected", { fields: fromFields.join(", ") || t("tfNone") })}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="separator">{t("tfSeparator")}</Label>
          <Input
            id="separator"
            value={separator}
            onChange={handleSeparatorChange}
            placeholder={t("tfSeparatorPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">{t("tfTargetFieldName")}</Label>
          <Input id="to" value={to} onChange={handleToChange} placeholder={t("tfTargetFieldPlaceholder")} />
        </div>
      </div>
    </div>
  );
};

interface SplitEditorProps {
  from: string;
  delimiter: string;
  toFields: string[];
  sourceColumns: string[];
  onChange: (updates: Partial<IngestTransform>) => void;
}

const SplitEditor = ({ from, delimiter, toFields, sourceColumns, onChange }: Readonly<SplitEditorProps>) => {
  const t = useTranslations("Ingest");
  const [toFieldsText, setToFieldsText] = useState(toFields.join(", "));
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleDelimiterChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ delimiter: e.target.value });
  const handleToFieldsTextChange = (e: React.ChangeEvent<HTMLInputElement>) => setToFieldsText(e.target.value);
  const handleToFieldsBlur = () => {
    onChange({
      toFields: toFieldsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="from"
          label={t("tfSourceField")}
          value={from}
          sourceColumns={sourceColumns}
          onValueChange={handleFromChange}
        />
        <div className="space-y-2">
          <Label htmlFor="delimiter">{t("tfDelimiter")}</Label>
          <Input
            id="delimiter"
            value={delimiter}
            onChange={handleDelimiterChange}
            placeholder={t("tfDelimiterPlaceholder")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="toFields">{t("tfTargetFieldNames")}</Label>
        <Input
          id="toFields"
          value={toFieldsText}
          onChange={handleToFieldsTextChange}
          onBlur={handleToFieldsBlur}
          placeholder={t("tfTargetFieldNamesPlaceholder")}
        />
        <p className="text-muted-foreground text-xs">{t("tfTargetFieldNamesHint")}</p>
      </div>
    </div>
  );
};

const ParseJsonArrayEditor = ({
  from,
  to,
  sourceColumns,
  onChange,
}: Readonly<{
  from: string;
  to?: string;
  sourceColumns: string[];
  onChange: (u: Partial<IngestTransform>) => void;
}>) => {
  const t = useTranslations("Ingest");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value || undefined });

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("tfParseJsonArrayDesc")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="from"
          label={t("tfSourceField")}
          value={from}
          sourceColumns={sourceColumns}
          onValueChange={handleFromChange}
        />
        <div className="space-y-2">
          <Label htmlFor="to">{t("tfTargetField")}</Label>
          <Input id="to" value={to ?? ""} onChange={handleToChange} placeholder={from || t("tfSourceField")} />
        </div>
      </div>
    </div>
  );
};

const ExtractEditor = ({
  from,
  to,
  pattern,
  group,
  sourceColumns,
  onChange,
}: Readonly<{
  from: string;
  to: string;
  pattern: string;
  group?: number;
  sourceColumns: string[];
  onChange: (u: Partial<IngestTransform>) => void;
}>) => {
  const t = useTranslations("Ingest");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value });
  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ pattern: e.target.value });
  const handleGroupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number.parseInt(e.target.value, 10);
    onChange({ group: Number.isNaN(val) ? undefined : val });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="from"
          label={t("tfSourceField")}
          value={from}
          sourceColumns={sourceColumns}
          onValueChange={handleFromChange}
        />
        <div className="space-y-2">
          <Label htmlFor="to">{t("tfTargetField")}</Label>
          <Input id="to" value={to} onChange={handleToChange} placeholder={t("tfTargetFieldExtractPlaceholder")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pattern">{t("tfRegexPattern")}</Label>
          <Input
            id="pattern"
            value={pattern}
            onChange={handlePatternChange}
            placeholder={t("tfRegexPatternPlaceholder")}
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group">{t("tfCaptureGroup")}</Label>
          <Input id="group" type="number" min={0} value={group ?? 1} onChange={handleGroupChange} placeholder="1" />
        </div>
      </div>
    </div>
  );
};
