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
import { useTranslations } from "next-intl";
import type React from "react";
import { useState } from "react";

import { DATE_FORMAT_OPTIONS, type ImportTransform } from "@/lib/types/import-transforms";

import { TypeCastEditor } from "./type-cast-editor";

interface TransformEditorProps {
  transform: ImportTransform;
  onChange: (updates: Partial<ImportTransform>) => void;
  sourceColumns: string[];
}

export const TransformEditor = ({ transform, onChange, sourceColumns }: Readonly<TransformEditorProps>) => {
  const t = useTranslations("Import");

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
  const t = useTranslations("Import");
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
  onChange: (u: Partial<ImportTransform>) => void;
}>) => {
  const t = useTranslations("Import");
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
  onChange: (updates: Partial<ImportTransform>) => void;
}

const DateParseEditor = ({
  from,
  inputFormat,
  outputFormat,
  timezone,
  sourceColumns,
  onChange,
}: Readonly<DateParseEditorProps>) => {
  const t = useTranslations("Import");
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
  operation: "uppercase" | "lowercase" | "replace";
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
}: Readonly<StringOpEditorProps>) => {
  const t = useTranslations("Import");
  const handleFromChange = (value: string) => onChange({ from: value });
  const handleOperationChange = (value: string) => onChange({ operation: value as StringOpEditorProps["operation"] });
  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ pattern: e.target.value });
  const handleReplacementChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ replacement: e.target.value });

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
  onChange: (u: Partial<ImportTransform>) => void;
}>) => (
  <button
    type="button"
    onClick={() =>
      onChange({ fromFields: isSelected ? fromFields.filter((f) => f !== column) : [...fromFields, column] })
    }
    className={`rounded-md border px-2 py-1 text-sm transition-colors ${
      isSelected
        ? "border-cartographic-forest bg-cartographic-forest/10 text-cartographic-forest"
        : "border-border text-muted-foreground hover:border-cartographic-forest/50"
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
  onChange: (updates: Partial<ImportTransform>) => void;
}

const ConcatenateEditor = ({
  fromFields,
  separator,
  to,
  sourceColumns,
  onChange,
}: Readonly<ConcatenateEditorProps>) => {
  const t = useTranslations("Import");
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
  onChange: (updates: Partial<ImportTransform>) => void;
}

const SplitEditor = ({ from, delimiter, toFields, sourceColumns, onChange }: Readonly<SplitEditorProps>) => {
  const t = useTranslations("Import");
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
