/**
 * ID strategy and deduplication card for the field mapping step.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { HashIcon } from "lucide-react";

import type { FieldMapping } from "@/lib/types/import-wizard";

export const ID_STRATEGIES = [
  { value: "auto", label: "Auto-generate", description: "Generate unique IDs automatically" },
  { value: "external", label: "Use source ID", description: "Use ID from your data" },
  { value: "computed", label: "Compute from fields", description: "Generate from selected fields" },
  { value: "hybrid", label: "Hybrid", description: "Use source ID if available, otherwise compute" },
] as const;

export const DEDUP_STRATEGIES = [
  { value: "skip", label: "Skip duplicates", description: "Don't import events that already exist" },
  { value: "update", label: "Update existing", description: "Update existing events with new data" },
  { value: "version", label: "Create versions", description: "Keep both old and new versions" },
] as const;

export interface IdStrategyCardProps {
  idStrategy: FieldMapping["idStrategy"];
  idField: string | null;
  headers: string[];
  deduplicationStrategy: string;
  onFieldChange: (field: keyof FieldMapping, value: string | null) => void;
  onDeduplicationChange: (value: string) => void;
}

export const IdStrategyCard = ({
  idStrategy,
  idField,
  headers,
  deduplicationStrategy,
  onFieldChange,
  onDeduplicationChange,
}: Readonly<IdStrategyCardProps>) => {
  const showIdField = idStrategy === "external" || idStrategy === "hybrid";

  const handleStrategyChange = (val: string) => onFieldChange("idStrategy", val);

  const handleIdFieldChange = (val: string) => onFieldChange("idField", val === "__none__" ? null : val);

  return (
    <Card className="overflow-hidden">
      <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-cartographic-navy/10 flex h-10 w-10 items-center justify-center rounded-sm">
            <HashIcon className="text-cartographic-navy h-5 w-5" />
          </div>
          <div>
            <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Identity & Duplicates</h3>
            <p className="text-cartographic-navy/70 text-sm">How to identify and handle duplicate events</p>
          </div>
        </div>
      </div>
      <CardContent className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="id-strategy" className="text-cartographic-charcoal">
              ID generation
            </Label>
            <Select value={idStrategy} onValueChange={handleStrategyChange}>
              <SelectTrigger id="id-strategy" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ID_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dedup-strategy" className="text-cartographic-charcoal">
              Duplicate handling
            </Label>
            <Select value={deduplicationStrategy} onValueChange={onDeduplicationChange}>
              <SelectTrigger id="dedup-strategy" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEDUP_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {showIdField && (
          <div className="space-y-2">
            <Label htmlFor="id-field" className="text-cartographic-charcoal">
              ID Field
            </Label>
            <Select value={idField ?? "__none__"} onValueChange={handleIdFieldChange}>
              <SelectTrigger id="id-field" className="h-11">
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select column...</SelectItem>
                {headers.map((header) => (
                  <SelectItem key={header} value={header}>
                    {header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
